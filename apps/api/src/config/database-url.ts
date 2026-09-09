/**
 * Normaliza DATABASE_URL para tolerar los errores más comunes al pegarla en el
 * panel de un hosting, de modo que la app conecte igual sin que el usuario tenga
 * que corregir la variable a mano:
 *   - "…?a=1?b=2"        → "…?a=1&b=2"  (un segundo '?' que debía ser '&')
 *   - parámetros repetidos → se conserva el primero (p.ej. sslmode duplicado)
 *   - channel_binding      → se elimina (Prisma no lo soporta y rompe la conexión)
 *   - falta sslmode en una BD remota → se añade sslmode=require (Neon/Supabase)
 *
 * No toca conexiones locales (localhost/127.0.0.1): ahí NO se fuerza SSL.
 */
export function sanitizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const s = raw.trim();
  const isLocal = s.includes("localhost") || s.includes("127.0.0.1");
  const i = s.indexOf("?");
  if (i === -1) return isLocal ? s : `${s}?sslmode=require`;
  const base = s.slice(0, i);
  // Un segundo '?' pegado por error se trata como separador de parámetros.
  const query = s.slice(i + 1).replace(/\?/g, "&");
  const params: [string, string][] = [];
  const seen = new Set<string>();
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    const v = eq === -1 ? "" : pair.slice(eq + 1);
    if (k === "channel_binding") continue; // Prisma no lo soporta
    if (seen.has(k)) continue; // dedupe: conserva el primero
    seen.add(k);
    params.push([k, v]);
  }
  if (!isLocal && !seen.has("sslmode")) params.push(["sslmode", "require"]);
  const q = params.map(([k, v]) => (v === "" ? k : `${k}=${v}`)).join("&");
  return q ? `${base}?${q}` : base;
}

/**
 * Variante para MIGRACIONES (`prisma migrate deploy`): además de normalizar, usa
 * la conexión DIRECTA de Neon (sin el sufijo "-pooler"), que es la recomendada
 * para migrar. Para otros proveedores no cambia nada.
 */
export function migrationDatabaseUrl(raw: string | undefined): string | undefined {
  const s = sanitizeDatabaseUrl(raw);
  if (!s) return s;
  return s.replace("-pooler.", ".");
}

/** Aplica la normalización a process.env.DATABASE_URL (idempotente). */
export function applyDatabaseUrlFixups(): void {
  const fixed = sanitizeDatabaseUrl(process.env.DATABASE_URL);
  if (fixed && fixed !== process.env.DATABASE_URL) {
    process.env.DATABASE_URL = fixed;
  }
}
