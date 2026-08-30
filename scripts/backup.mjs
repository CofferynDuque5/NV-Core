#!/usr/bin/env node
/**
 * Copia de seguridad de NV Core: base de datos + sesiones de WhatsApp/Telegram.
 *
 *   pnpm backup            # crea backups/nvcore-AAAAMMDD-HHMMSS/
 *
 * Guarda:
 *   • db.sql        → volcado de PostgreSQL (pg_dump), si está disponible
 *   • whatsapp/     → credenciales de Baileys (para no re-escanear el QR)
 *   • telegram/     → StringSession de GramJS (cuenta de Telegram)
 *   • manifest.json → qué se incluyó y cuándo (sin credenciales)
 *
 * Restaurar:  pnpm restore <carpeta-del-backup> [--db]
 *
 * Las copias NUNCA se suben al repo (backups/ está en .gitignore). Guárdalas en
 * un lugar seguro: contienen tus sesiones activas.
 */
import { existsSync, mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const log = (m) => console.log(m);
const warn = (m) => console.warn(`⚠ ${m}`);

/** Read a KEY=value from apps/api/.env (returns undefined if missing). */
function envVar(key) {
  const file = join(ROOT, "apps", "api", ".env");
  if (!existsSync(file)) return undefined;
  const m = readFileSync(file, "utf8").match(new RegExp("^" + key + "=(.*)$", "m"));
  return m ? m[1].trim() : undefined;
}

/**
 * Strip Prisma-only query params (notably `?schema=`) that libpq/pg_dump reject.
 * Returns the cleaned URL plus the schema name (for an explicit -n if not public).
 */
function pgUrl(url) {
  try {
    const u = new URL(url);
    const schema = u.searchParams.get("schema") || "public";
    u.searchParams.delete("schema");
    u.searchParams.delete("connection_limit");
    u.searchParams.delete("pool_timeout");
    u.searchParams.delete("pgbouncer");
    return { url: u.toString(), schema };
  } catch {
    return { url, schema: "public" };
  }
}

/** Resolve a (possibly relative) session dir against the repo root or apps/api. */
function resolveSessionDir(rel) {
  for (const base of [ROOT, join(ROOT, "apps", "api")]) {
    const p = resolve(base, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

function has(cmd) {
  const which = process.platform === "win32" ? "where" : "which";
  return spawnSync(which, [cmd]).status === 0;
}

/** Dump the DB to `outFile`. Tries pg_dump on PATH, then the dev Docker container. */
function dumpDatabase(databaseUrl, outFile) {
  if (!databaseUrl) return { ok: false, reason: "DATABASE_URL no definido en apps/api/.env" };
  const { url, schema } = pgUrl(databaseUrl);
  if (has("pg_dump")) {
    const schemaArgs = schema && schema !== "public" ? ["-n", schema] : [];
    const r = spawnSync("pg_dump", ["--no-owner", "--no-privileges", ...schemaArgs, "-f", outFile, url], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (r.status === 0) return { ok: true, via: "pg_dump" };
  }
  // Fallback: the container that `pnpm arrancar` manages.
  if (has("docker")) {
    const r = spawnSync(
      "docker",
      ["exec", "nvcore-dev-db", "pg_dump", "--no-owner", "--no-privileges", "-U", "postgres", "nvcore"],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    if (r.status === 0 && r.stdout?.length) {
      writeFileSync(outFile, r.stdout);
      return { ok: true, via: "docker exec nvcore-dev-db" };
    }
  }
  return { ok: false, reason: "no se encontró pg_dump ni el contenedor nvcore-dev-db" };
}

// Timestamp AAAAMMDD-HHMMSS (filesystem-safe, sorts chronologically).
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const outDir = join(ROOT, "backups", `nvcore-${ts}`);
mkdirSync(outDir, { recursive: true });

const manifest = { createdAt: now.toISOString(), included: [] };

// 1) Database
const dbUrl = envVar("DATABASE_URL");
const db = dumpDatabase(dbUrl, join(outDir, "db.sql"));
if (db.ok) {
  log(`✓ Base de datos → db.sql (${db.via})`);
  manifest.included.push("db.sql");
  // Record only the host/db, never the credentials.
  try {
    const u = new URL(dbUrl);
    manifest.database = { host: u.hostname, port: u.port, name: u.pathname.replace(/^\//, "") };
  } catch {
    /* ignore */
  }
} else {
  warn(`Base de datos no respaldada: ${db.reason}`);
}

// 2) Sessions
for (const [key, def, name] of [
  ["WHATSAPP_SESSION_DIR", "data/whatsapp", "whatsapp"],
  ["TELEGRAM_SESSION_DIR", "data/telegram", "telegram"],
]) {
  const dir = resolveSessionDir(envVar(key) || def);
  if (dir) {
    cpSync(dir, join(outDir, name), { recursive: true });
    log(`✓ Sesión ${name} → ${name}/`);
    manifest.included.push(`${name}/`);
  } else {
    log(`• Sin sesión de ${name} que respaldar (aún no conectada).`);
  }
}

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

log(`\n✓ Copia creada en: ${outDir}`);
log("Guárdala en un lugar seguro (contiene tus sesiones activas).");
log(`Restaurar:  pnpm restore "${outDir}" --db\n`);
