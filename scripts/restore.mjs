#!/usr/bin/env node
/**
 * Restaurar una copia de NV Core creada por `pnpm backup`.
 *
 *   pnpm restore <carpeta-del-backup>         # solo sesiones (WhatsApp/Telegram)
 *   pnpm restore <carpeta-del-backup> --db    # también restaura la base de datos
 *   pnpm restore --latest [--db]              # usa el backup más reciente
 *
 * Restaurar la BD SOBRESCRIBE los datos actuales. Detén la API antes de hacerlo.
 */
import { existsSync, readdirSync, cpSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const log = (m) => console.log(m);
const die = (m) => {
  console.error(`✖ ${m}`);
  process.exit(1);
};

const args = process.argv.slice(2);
const withDb = args.includes("--db");
const useLatest = args.includes("--latest");
const target = args.find((a) => !a.startsWith("--"));

function latestBackup() {
  const dir = join(ROOT, "backups");
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir)
    .map((n) => join(dir, n))
    .filter((p) => statSync(p).isDirectory())
    .sort();
  return entries.length ? entries[entries.length - 1] : null;
}

const backupDir = useLatest ? latestBackup() : target ? resolve(target) : null;
if (!backupDir) die("Indica la carpeta del backup o usa --latest.");
if (!existsSync(backupDir)) die(`No existe: ${backupDir}`);

log(`Restaurando desde: ${backupDir}`);

function envVar(key) {
  const file = join(ROOT, "apps", "api", ".env");
  if (!existsSync(file)) return undefined;
  const m = readFileSync(file, "utf8").match(new RegExp("^" + key + "=(.*)$", "m"));
  return m ? m[1].trim() : undefined;
}

function sessionTargetDir(rel) {
  // Prefer an existing location; else default to repo-root/<rel>.
  for (const base of [ROOT, join(ROOT, "apps", "api")]) {
    const p = resolve(base, rel);
    if (existsSync(p)) return p;
  }
  return resolve(ROOT, rel);
}

function has(cmd) {
  const which = process.platform === "win32" ? "where" : "which";
  return spawnSync(which, [cmd]).status === 0;
}

/** Strip Prisma-only query params (e.g. ?schema=) that psql rejects. */
function pgUrl(url) {
  try {
    const u = new URL(url);
    for (const k of ["schema", "connection_limit", "pool_timeout", "pgbouncer"]) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

// 1) Sessions
for (const [key, def, name] of [
  ["WHATSAPP_SESSION_DIR", "data/whatsapp", "whatsapp"],
  ["TELEGRAM_SESSION_DIR", "data/telegram", "telegram"],
]) {
  const src = join(backupDir, name);
  if (!existsSync(src)) {
    log(`• Sin sesión de ${name} en la copia.`);
    continue;
  }
  const dest = sessionTargetDir(envVar(key) || def);
  cpSync(src, dest, { recursive: true });
  log(`✓ Sesión ${name} restaurada → ${dest}`);
}

// 2) Database (opt-in, destructive)
if (withDb) {
  const sql = join(backupDir, "db.sql");
  if (!existsSync(sql)) {
    log("• La copia no incluye db.sql; se omite la base de datos.");
  } else {
    const dbUrl = envVar("DATABASE_URL");
    if (!dbUrl) die("DATABASE_URL no definido en apps/api/.env.");
    if (!has("psql")) die("psql no está disponible en el PATH; instálalo o restaura la BD manualmente.");
    log("⚠ Restaurando la base de datos (sobrescribe los datos actuales)…");
    const r = spawnSync("psql", [pgUrl(dbUrl), "-v", "ON_ERROR_STOP=1", "-f", sql], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (r.status !== 0) die("Falló la restauración de la base de datos.");
    log("✓ Base de datos restaurada.");
  }
} else {
  log("• Base de datos NO restaurada (pasa --db para incluirla).");
}

log("\n✓ Restauración completada. Arranca de nuevo:  pnpm arrancar\n");
