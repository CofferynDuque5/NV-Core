import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MetaCreds {
  fbPageId?: string | null;
  fbPageToken?: string | null;
  igBusinessId?: string | null;
  igToken?: string | null;
}

export interface SocialPost {
  message?: string;
  attachments?: { url?: string; kind?: string; mime?: string | null; filename?: string | null }[];
  format?: string | null;
}

export interface SocialResult {
  target: "facebook" | "instagram";
  ok: boolean;
  id?: string;
  format?: string;
  error?: string;
}

/**
 * Real Facebook (Page) + Instagram (Business) publishing via the Meta Graph API.
 * URL-native: media is delivered by public URL (Cloudinary/media), no local disk.
 * Credentials come from the workspace's Connection rows, with env fallback.
 */
@Injectable()
export class MetaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve FB/IG credentials for a workspace (Connection rows → env fallback). */
  async creds(workspaceSlug: string): Promise<MetaCreds> {
    let fb: { handle: string; token: string | null } | null = null;
    let ig: { handle: string; token: string | null } | null = null;
    if (this.prisma.enabled) {
      const rows = await this.prisma.connection.findMany({
        where: { workspaceSlug, channel: { in: ["fb", "ig"] } },
      });
      for (const r of rows) {
        if (r.channel === "fb") fb = { handle: r.handle, token: r.token };
        if (r.channel === "ig") ig = { handle: r.handle, token: r.token };
      }
    }
    const fbPageToken = fb?.token || process.env.FB_PAGE_TOKEN || null;
    return {
      fbPageId: fb?.handle || process.env.FB_PAGE_ID || null,
      fbPageToken,
      igBusinessId: ig?.handle || process.env.IG_BUSINESS_ID || null,
      igToken: ig?.token || process.env.IG_ACCESS_TOKEN || fbPageToken,
    };
  }

  fbConfigured(c: MetaCreds): boolean {
    return Boolean(c.fbPageId && c.fbPageToken);
  }
  igConfigured(c: MetaCreds): boolean {
    return Boolean(c.igBusinessId && c.igToken);
  }

  async status(workspaceSlug: string): Promise<{ facebook: boolean; instagram: boolean }> {
    const c = await this.creds(workspaceSlug);
    return { facebook: this.fbConfigured(c), instagram: this.igConfigured(c) };
  }

  private async graphForm(url: string, params: Record<string, string>): Promise<any> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Graph ${res.status}`);
    return data;
  }

  private async graphGet(path: string, token: string, extra: Record<string, string> = {}): Promise<any> {
    const qs = new URLSearchParams({ access_token: token, ...extra }).toString();
    const res = await fetch(`${GRAPH}/${path}?${qs}`);
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Graph ${res.status}`);
    return data;
  }

  // ── Facebook ───────────────────────────────────────────────────────────────
  async publishFacebook(c: MetaCreds, post: SocialPost): Promise<SocialResult> {
    if (!this.fbConfigured(c)) throw new Error("Facebook no configurado (página + token).");
    const token = c.fbPageToken!;
    const page = c.fbPageId!;
    const att = post.attachments?.[0];
    const message = post.message ?? "";

    if (att?.url && att.kind === "video") {
      // Video → Reel (Graph descarga el archivo por URL).
      const data = await this.graphForm(`${GRAPH}/${page}/video_reels`, {
        upload_phase: "finish",
        video_state: "PUBLISHED",
        description: message,
        file_url: att.url,
        access_token: token,
      });
      return { target: "facebook", ok: true, id: data.post_id || data.video_id, format: "reel" };
    }
    if (att?.url && att.kind === "image") {
      const data = await this.graphForm(`${GRAPH}/${page}/photos`, {
        url: att.url,
        caption: message,
        access_token: token,
      });
      return { target: "facebook", ok: true, id: data.post_id || data.id };
    }
    if (!message.trim()) throw new Error("El mensaje está vacío.");
    const data = await this.graphForm(`${GRAPH}/${page}/feed`, { message, access_token: token });
    return { target: "facebook", ok: true, id: data.id };
  }

  // ── Instagram ────────────────────────────────────────────────────────────────
  private async waitContainer(token: string, creationId: string, tries = 30): Promise<void> {
    for (let i = 0; i < tries; i++) {
      const data = await this.graphGet(creationId, token, { fields: "status_code" }).catch(() => ({}));
      if (data.status_code === "FINISHED") return;
      if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
        throw new Error(`Procesamiento de media falló (${data.status_code}).`);
      }
      await sleep(3000);
    }
    throw new Error("Tiempo de espera agotado procesando el media.");
  }

  private async igContainer(
    igId: string,
    token: string,
    params: Record<string, string>,
    isVideo: boolean,
  ): Promise<string> {
    const c = await this.graphForm(`${GRAPH}/${igId}/media`, { ...params, access_token: token });
    if (isVideo) await this.waitContainer(token, c.id);
    return c.id;
  }

  async publishInstagram(c: MetaCreds, post: SocialPost): Promise<SocialResult> {
    if (!this.igConfigured(c)) throw new Error("Instagram no configurado (business id + token).");
    const token = c.igToken!;
    const igId = c.igBusinessId!;
    const message = post.message ?? "";
    const media = (post.attachments ?? []).filter((a) => a.url);
    const fmt =
      post.format || (media.length > 1 ? "carousel" : media[0]?.kind === "video" ? "reel" : "feed");

    if (!media.length) throw new Error("Instagram requiere una imagen o video.");

    let creationId: string;
    if (fmt === "carousel") {
      if (media.length < 2) throw new Error("El carrusel requiere 2 o más elementos.");
      const children: string[] = [];
      for (const att of media.slice(0, 10)) {
        const isVideo = att.kind === "video";
        const id = await this.igContainer(
          igId,
          token,
          isVideo
            ? { media_type: "VIDEO", video_url: att.url!, is_carousel_item: "true" }
            : { image_url: att.url!, is_carousel_item: "true" },
          isVideo,
        );
        children.push(id);
      }
      creationId = await this.igContainer(
        igId,
        token,
        { media_type: "CAROUSEL", caption: message, children: children.join(",") },
        false,
      );
    } else if (fmt === "reel") {
      const att = media[0];
      if (att.kind !== "video") throw new Error("Un Reel requiere un video.");
      creationId = await this.igContainer(
        igId,
        token,
        { media_type: "REELS", video_url: att.url!, caption: message },
        true,
      );
    } else if (fmt === "story") {
      const att = media[0];
      const isVideo = att.kind === "video";
      creationId = await this.igContainer(
        igId,
        token,
        isVideo ? { media_type: "STORIES", video_url: att.url! } : { media_type: "STORIES", image_url: att.url! },
        isVideo,
      );
    } else {
      const att = media[0];
      const isVideo = att.kind === "video";
      creationId = await this.igContainer(
        igId,
        token,
        isVideo
          ? { media_type: "VIDEO", video_url: att.url!, caption: message }
          : { image_url: att.url!, caption: message },
        isVideo,
      );
    }

    const published = await this.graphForm(`${GRAPH}/${igId}/media_publish`, {
      creation_id: creationId,
      access_token: token,
    });
    return { target: "instagram", ok: true, id: published.id, format: fmt };
  }

  /** Publish to the given targets; returns one result per target (never throws). */
  async publish(
    workspaceSlug: string,
    targets: ("facebook" | "instagram")[],
    post: SocialPost,
  ): Promise<SocialResult[]> {
    const c = await this.creds(workspaceSlug);
    const out: SocialResult[] = [];
    for (const target of targets) {
      try {
        if (target === "facebook") out.push(await this.publishFacebook(c, post));
        else out.push(await this.publishInstagram(c, post));
      } catch (err) {
        out.push({ target, ok: false, error: (err as Error).message });
      }
    }
    return out;
  }

  // ── Insights ─────────────────────────────────────────────────────────────────
  async getInsights(
    workspaceSlug: string,
    target: "facebook" | "instagram",
    id: string,
  ): Promise<{ target: string; id: string; metrics: Record<string, unknown> }> {
    const c = await this.creds(workspaceSlug);
    if (target === "facebook") {
      if (!this.fbConfigured(c)) throw new Error("Facebook no configurado.");
      const token = c.fbPageToken!;
      const data = await this.graphGet(id, token, {
        fields: "likes.summary(true),comments.summary(true),shares",
      });
      const metrics: Record<string, unknown> = {
        likes: data?.likes?.summary?.total_count ?? null,
        comments: data?.comments?.summary?.total_count ?? null,
        shares: data?.shares?.count ?? null,
      };
      try {
        const ins = await this.graphGet(`${id}/insights`, token, {
          metric: "post_impressions,post_impressions_unique",
        });
        for (const item of ins?.data ?? []) {
          if (item.name === "post_impressions") metrics.impressions = item?.values?.[0]?.value ?? null;
          if (item.name === "post_impressions_unique") metrics.reach = item?.values?.[0]?.value ?? null;
        }
      } catch {
        /* insights opcionales */
      }
      return { target, id, metrics };
    }
    if (!this.igConfigured(c)) throw new Error("Instagram no configurado.");
    const token = c.igToken!;
    const data = await this.graphGet(id, token, {
      fields: "like_count,comments_count,media_product_type",
    });
    const metrics: Record<string, unknown> = {
      likes: data?.like_count ?? null,
      comments: data?.comments_count ?? null,
    };
    const product = data?.media_product_type;
    const metric =
      product === "REELS"
        ? "reach,likes,comments,shares,saved,plays"
        : product === "STORY"
          ? "reach,impressions,replies"
          : "reach,impressions,saved";
    try {
      const ins = await this.graphGet(`${id}/insights`, token, { metric });
      for (const item of ins?.data ?? []) metrics[item.name] = item?.values?.[0]?.value ?? null;
    } catch {
      /* insights opcionales */
    }
    return { target, id, metrics };
  }
}
