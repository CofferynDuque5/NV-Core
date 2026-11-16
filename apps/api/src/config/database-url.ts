/**
 * Normaliza DATABASE_URL para tolerar los errores más comunes al pegarla en el
 * panel de un hosting, de modo que la app conecte igual sin que el usuario tenga
 * que corregir la variable a mano:
 *   - "…?a=1?b=2"        → "…?a=1&b=2"  (un segundo '?' que debía ser '&')
 *   - parámetros repetidos → se conserva el primero (p.ej. sslmode duplicado)
 *   - channel_binding      → se elimina (Prisma no lo soporta y rompe la conexión)
 *   - falta sslmode en una BD remota → se añade sslmode=require (Neon/Supabase)
 *   - pooler de transacción de Supabase (puerto 6543) → se añade pgbouncer=true
 *
 * No toca conexiones locales (localhost/127.0.0.1): ahí NO se fuerza SSL.
 */
export function sanitizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const s = raw.trim();
  const isLocal = s.includes("localhost") || s.includes("127.0.0.1");
  const i = s.indexOf("?");
  if (i === -1 && isLocal) return s;
  const base = i === -1 ? s : s.slice(0, i);
  // Un segundo '?' pegado por error se trata como separador de parámetros.
  const query = i === -1 ? "" : s.slice(i + 1).replace(/\?/g, "&");
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
  // Supabase «Transaction pooler» (puerto 6543) no admite las sentencias
  // preparadas de Prisma: sin pgbouncer=true falla con «prepared statement … already exists».
  if (isSupabaseTransactionPooler(base) && !seen.has("pgbouncer")) params.push(["pgbouncer", "true"]);
  const q = params.map(([k, v]) => (v === "" ? k : `${k}=${v}`)).join("&");
  return q ? `${base}?${q}` : base;
}

/** Host del pooler de Supabase en modo transacción (puerto 6543). */
function isSupabaseTransactionPooler(base: string): boolean {
  return /@[^/?#]*\.pooler\.supabase\.com:6543(\/|$)/i.test(base);
}

/**
 * Variante para MIGRACIONES (`prisma migrate deploy`): además de normalizar,
 *   - Neon: usa la conexión DIRECTA (sin el sufijo "-pooler").
 *   - Supabase: cambia el pooler de transacción (6543) por el de sesión (5432),
 *     que sí admite cambios de estructura, y quita pgbouncer=true.
 * Para otros proveedores no cambia nada.
 */
export function migrationDatabaseUrl(raw: string | undefined): string | undefined {
  const s = sanitizeDatabaseUrl(raw);
  if (!s) return s;
  const i = s.indexOf("?");
  const base = i === -1 ? s : s.slice(0, i);
  if (isSupabaseTransactionPooler(base)) {
    const query = i === -1 ? "" : s.slice(i + 1).split("&").filter((p) => !p.startsWith("pgbouncer=")).join("&");
    const session = base.replace(/\.pooler\.supabase\.com:6543/i, ".pooler.supabase.com:5432");
    return query ? `${session}?${query}` : session;
  }
  return s.replace("-pooler.", ".");
}

/** Aplica la normalización a process.env.DATABASE_URL (idempotente). */
export function applyDatabaseUrlFixups(): void {
  const fixed = sanitizeDatabaseUrl(process.env.DATABASE_URL);
  if (fixed && fixed !== process.env.DATABASE_URL) {
    process.env.DATABASE_URL = fixed;
  }
}
