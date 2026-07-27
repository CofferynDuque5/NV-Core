import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Publicación real en Facebook (Página) e Instagram (cuenta Business) vía la
 * Meta Graph API. Sin SDK: todo sobre `fetch`.
 *
 * Formatos IG soportados: imagen (feed), video/reel, historia (story) y
 * carrusel. Facebook: texto, foto y video.
 */
const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const UPLOAD_DIR = resolve(process.env.NSAP_UPLOAD_DIR ?? "data/uploads");
const APP_URL = (process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");

export function fbConfigured() {
  return Boolean(process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN);
}
export function igConfigured() {
  return Boolean(process.env.IG_BUSINESS_ID && (process.env.IG_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN));
}
const igToken = () => process.env.IG_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN;
const publicUrl = (att) => `${APP_URL}/media/${att.path}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(message, status = 503) {
  return Object.assign(new Error(message), { status });
}

async function graphForm(url, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Graph ${res.status}`);
  return data;
}

// ── Facebook ─────────────────────────────────────────────────────────────────
export async function publishFacebook({ message = "", attachment = null }) {
  if (!fbConfigured()) throw fail("Facebook no configurado (FB_PAGE_ID / FB_PAGE_TOKEN).");
  const token = process.env.FB_PAGE_TOKEN;
  const page = process.env.FB_PAGE_ID;

  if (attachment?.kind === "video") {
    const buf = readFileSync(resolve(UPLOAD_DIR, attachment.path));
    const fd = new FormData();
    fd.append("description", message);
    fd.append("access_token", token);
    fd.append("source", new Blob([buf], { type: attachment.mime }), attachment.filename || "video");
    const res = await fetch(`${GRAPH}/${page}/videos`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Graph ${res.status}`);
    return { id: data.id, target: "facebook" };
  }
  if (attachment?.kind === "image") {
    const buf = readFileSync(resolve(UPLOAD_DIR, attachment.path));
    const fd = new FormData();
    fd.append("caption", message);
    fd.append("access_token", token);
    fd.append("source", new Blob([buf], { type: attachment.mime }), attachment.filename || "image");
    const res = await fetch(`${GRAPH}/${page}/photos`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Graph ${res.status}`);
    return { id: data.post_id || data.id, target: "facebook" };
  }

  if (!message.trim()) throw fail("El mensaje está vacío.", 400);
  const data = await graphForm(`${GRAPH}/${page}/feed`, { message, access_token: token });
  return { id: data.id, target: "facebook" };
}

// ── Instagram ────────────────────────────────────────────────────────────────
/** Espera a que un contenedor de video termine de procesarse. */
async function waitContainer(token, creationId, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`${GRAPH}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    const status = data.status_code;
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`Procesamiento de media falló (${status}).`);
    await sleep(3000);
  }
  throw new Error("Tiempo de espera agotado procesando el media.");
}

async function igContainer(igId, token, params, isVideo) {
  const c = await graphForm(`${GRAPH}/${igId}/media`, { ...params, access_token: token });
  if (isVideo) await waitContainer(token, c.id);
  return c.id;
}

/**
 * Publica en Instagram. `format`: 'feed' (imagen/video), 'reel', 'story' o
 * 'carousel'. Requiere URLs públicas (APP_URL debe ser accesible desde internet).
 */
export async function publishInstagram({ message = "", attachment = null, attachments = null, format = null }) {
  if (!igConfigured()) throw fail("Instagram no configurado (IG_BUSINESS_ID / token).");
  const token = igToken();
  const igId = process.env.IG_BUSINESS_ID;
  const media = attachments?.length ? attachments : attachment ? [attachment] : [];
  const fmt = format || (attachments?.length > 1 ? "carousel" : attachment?.kind === "video" ? "reel" : "feed");

  if (!media.length && fmt !== "feed") throw fail("Instagram requiere imagen o video.", 400);

  let creationId;
  if (fmt === "carousel") {
    if (media.length < 2) throw fail("El carrusel requiere 2 o más elementos.", 400);
    const children = [];
    for (const att of media.slice(0, 10)) {
      const isVideo = att.kind === "video";
      const id = await igContainer(
        igId,
        token,
        isVideo
          ? { media_type: "VIDEO", video_url: publicUrl(att), is_carousel_item: "true" }
          : { image_url: publicUrl(att), is_carousel_item: "true" },
        isVideo,
      );
      children.push(id);
    }
    creationId = await igContainer(igId, token, { media_type: "CAROUSEL", caption: message, children: children.join(",") }, false);
  } else if (fmt === "reel") {
    const att = media[0];
    if (att?.kind !== "video") throw fail("Un Reel requiere un video.", 400);
    creationId = await igContainer(igId, token, { media_type: "REELS", video_url: publicUrl(att), caption: message }, true);
  } else if (fmt === "story") {
    const att = media[0];
    if (!att) throw fail("La historia requiere imagen o video.", 400);
    const isVideo = att.kind === "video";
    creationId = await igContainer(
      igId,
      token,
      isVideo ? { media_type: "STORIES", video_url: publicUrl(att) } : { media_type: "STORIES", image_url: publicUrl(att) },
      isVideo,
    );
  } else {
    // feed
    const att = media[0];
    if (!att) throw fail("Instagram requiere una imagen o video.", 400);
    const isVideo = att.kind === "video";
    creationId = await igContainer(
      igId,
      token,
      isVideo ? { media_type: "VIDEO", video_url: publicUrl(att), caption: message } : { image_url: publicUrl(att), caption: message },
      isVideo,
    );
  }

  const published = await graphForm(`${GRAPH}/${igId}/media_publish`, { creation_id: creationId, access_token: token });
  return { id: published.id, target: "instagram", format: fmt };
}

/** Publica en varios destinos; devuelve un resultado por destino. */
export async function publishToTargets(targets, post) {
  const out = [];
  for (const target of targets) {
    try {
      if (target === "facebook") out.push({ target, ok: true, ...(await publishFacebook(post)) });
      else if (target === "instagram") out.push({ target, ok: true, ...(await publishInstagram(post)) });
    } catch (err) {
      out.push({ target, ok: false, error: err.message });
    }
  }
  return out;
}
