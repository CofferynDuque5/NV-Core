import { Injectable, Logger } from "@nestjs/common";

/**
 * Ayrshare transport — the "easy path" for Facebook / Instagram (and more).
 *
 * Meta's Graph API requires an app in review, approved permissions and an IG
 * Business account linked to a Page before it will publish. Ayrshare wraps all
 * of that behind a single API key: you connect the social accounts once in the
 * Ayrshare dashboard, then publish through one REST endpoint. This is the
 * closest thing to the "just works" experience we get with WhatsApp/Telegram.
 *
 * The key is read from the environment ONLY (`AYRSHARE_API_KEY`), never stored
 * in the repo. Optional `AYRSHARE_PROFILE_KEY` targets a specific user profile
 * on the Business plan (multi-account).
 */

const AYRSHARE_API = process.env.AYRSHARE_API_URL || "https://api.ayrshare.com/api";

/** Platforms Ayrshare can post to (we expose FB/IG through the provider layer). */
export type AyrsharePlatform =
  | "facebook"
  | "instagram"
  | "twitter"
  | "linkedin"
  | "tiktok"
  | "youtube"
  | "pinterest"
  | "telegram";

export interface AyrsharePost {
  message?: string;
  attachments?: { url?: string; kind?: string | undefined; mime?: string | null }[];
  format?: string | null;
}

export interface AyrshareResult {
  target: string;
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
  /** On failure: whether a retry with backoff could plausibly succeed. */
  retriable?: boolean;
}

interface AyrsharePostId {
  platform?: string;
  id?: string;
  postUrl?: string;
  status?: string;
}
interface AyrshareResponse {
  status?: string;
  errors?: { message?: string; code?: number; platform?: string }[];
  message?: string;
  postIds?: AyrsharePostId[];
  id?: string;
}

@Injectable()
export class AyrshareService {
  private readonly logger = new Logger(AyrshareService.name);

  apiKey(): string | null {
    return process.env.AYRSHARE_API_KEY?.trim() || null;
  }

  private profileKey(): string | null {
    return process.env.AYRSHARE_PROFILE_KEY?.trim() || null;
  }

  /** Whether an API key is present (nothing about which accounts are linked). */
  configured(): boolean {
    return Boolean(this.apiKey());
  }

  private headers(key: string): Record<string, string> {
    const h: Record<string, string> = {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    };
    const profile = this.profileKey();
    if (profile) h["Profile-Key"] = profile;
    return h;
  }

  /**
   * Publish to the given platforms. Returns one result per platform and never
   * throws — the caller maps each result to its provider adapter.
   */
  async publish(platforms: AyrsharePlatform[], post: AyrsharePost): Promise<AyrshareResult[]> {
    const key = this.apiKey();
    if (!key) {
      return platforms.map((p) => ({
        target: p,
        ok: false,
        error: "Ayrshare no configurado. Ejecuta: pnpm ayrshare <API_KEY>.",
      }));
    }

    const mediaUrls = (post.attachments ?? [])
      .map((a) => a.url)
      .filter((u): u is string => Boolean(u));

    // Instagram requires at least one media item; fail early with a clear message.
    if (platforms.includes("instagram") && mediaUrls.length === 0) {
      return platforms.map((p) => ({
        target: p,
        ok: false,
        error:
          p === "instagram"
            ? "Instagram requiere una imagen o video."
            : "Publicación no enviada (Instagram sin media en el lote).",
      }));
    }

    const body: Record<string, unknown> = {
      post: post.message ?? "",
      platforms,
    };
    if (mediaUrls.length) body.mediaUrls = mediaUrls;

    let res: Response;
    try {
      res = await fetch(`${AYRSHARE_API}/post`, {
        method: "POST",
        headers: this.headers(key),
        body: JSON.stringify(body),
      });
    } catch (e) {
      return platforms.map((p) => ({
        target: p,
        ok: false,
        error: `Ayrshare: red no disponible (${(e as Error).message}).`,
        retriable: true,
      }));
    }

    const data = (await res.json().catch(() => ({}))) as AyrshareResponse;
    const retriable = res.status === 429 || res.status >= 500;

    if (!res.ok || data.status === "error") {
      const msg =
        data.errors?.[0]?.message ||
        data.message ||
        `Ayrshare respondió ${res.status}.`;
      this.logger.warn(`Ayrshare publish falló (${res.status}): ${msg}`);
      return platforms.map((p) => {
        const perPlatform = data.errors?.find((e) => e.platform === p)?.message;
        return { target: p, ok: false, error: perPlatform || msg, retriable };
      });
    }

    // Success: map each platform to its returned post id (if any).
    return platforms.map((p) => {
      const entry = data.postIds?.find((x) => x.platform === p);
      const failed = entry?.status && entry.status !== "success";
      if (failed) {
        return { target: p, ok: false, error: `Ayrshare: estado "${entry?.status}".` };
      }
      return { target: p, ok: true, id: entry?.id || data.id, url: entry?.postUrl };
    });
  }

  /** Lightweight reachability/credential check for health surfaces. */
  async health(): Promise<{ configured: boolean; healthy: boolean; message: string }> {
    if (!this.configured()) {
      return {
        configured: false,
        healthy: false,
        message: "Falta AYRSHARE_API_KEY. Ejecuta: pnpm ayrshare <API_KEY>.",
      };
    }
    return { configured: true, healthy: true, message: "Ayrshare configurado." };
  }
}
