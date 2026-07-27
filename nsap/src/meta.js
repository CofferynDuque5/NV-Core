import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Publicación real en Facebook (Página) e Instagram (cuenta Business) vía la
 * Meta Graph API. Requiere las variables de entorno documentadas en el panel
 * de Conexiones. No usa SDK: todo sobre `fetch`.
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

function fail(message, status = 503) {
  return Object.assign(new Error(message), { status });
}

/** POST x-www-form-urlencoded a Graph y parsea JSON, lanzando el error de Meta. */
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

/** Publica en la Página de Facebook: foto (si hay imagen) o texto. */
export async function publishFacebook({ message = "", attachment = null }) {
  if (!fbConfigured()) throw fail("Facebook no configurado (FB_PAGE_ID / FB_PAGE_TOKEN).");
  const token = process.env.FB_PAGE_TOKEN;
  const page = process.env.FB_PAGE_ID;

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

/**
 * Publica en Instagram (feed). IG exige una URL de imagen PÚBLICA, por lo que
 * el archivo se sirve en `${APP_URL}/media/<archivo>` y APP_URL debe ser
 * accesible desde internet (usa un dominio/túnel público, no localhost).
 */
export async function publishInstagram({ message = "", attachment = null }) {
  if (!igConfigured()) throw fail("Instagram no configurado (IG_BUSINESS_ID / token).");
  if (attachment?.kind !== "image") throw fail("Instagram requiere una imagen.", 400);
  const token = igToken();
  const igId = process.env.IG_BUSINESS_ID;
  const imageUrl = `${APP_URL}/media/${attachment.path}`;

  // Paso 1: contenedor de media.
  const container = await graphForm(`${GRAPH}/${igId}/media`, {
    image_url: imageUrl,
    caption: message,
    access_token: token,
  });
  // Paso 2: publicar el contenedor.
  const published = await graphForm(`${GRAPH}/${igId}/media_publish`, {
    creation_id: container.id,
    access_token: token,
  });
  return { id: published.id, target: "instagram", imageUrl };
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
