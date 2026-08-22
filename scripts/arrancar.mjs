#!/usr/bin/env node
/**
 * NV Core — arranque local en UN comando (multiplataforma: Windows/Mac/Linux).
 *
 *   pnpm arrancar                 # todo: BD + deps + migraciones + API(:4000) + Web(:3000)
 *   pnpm arrancar --prepare-only  # solo prepara (BD + deps + migraciones), no levanta
 *   pnpm arrancar --skip-install  # omite la instalación de dependencias
 *   pnpm arrancar --no-db         # no gestiona Postgres (usa el que ya tengas)
 *   pnpm arrancar --help
 *
 * Hace de un tirón:
 *   1) Verifica Node/pnpm y crea los .env que falten (secretos aleatorios).
 *   2) Asegura un PostgreSQL de desarrollo (contenedor Docker con puerto al host,
 *      salvo --no-db o que ya tengas uno accesible).
 *   3) pnpm install
 *   4) prisma generate + migrate deploy
 *   5) pnpm dev  (API + Web con recarga en caliente)
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, copyFileSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
if (has("--help") || has("-h")) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const block = (src.match(/\/\*\*([\s\S]*?)\*\//) || [, ""])[1];
  console.log(
    block
      .split("\n")
      .map((l) => l.replace(/^\s*\* ?/, ""))
      .filter((l, i, a) => !(i === 0 && l === "") && !(i === a.length - 1 && l === ""))
      .join("\n"),
  );
  process.exit(0);
}
const PREPARE_ONLY = has("--prepare-only");
const SKIP_INSTALL = has("--skip-install");
const NO_DB = has("--no-db");

// ── Log helpers ──────────────────────────────────────────────────────────────
const color = process.stdout.isTTY;
const c = (n, s) => (color ? `\x1b[${n}m${s}\x1b[0m` : s);
const step = (s) => console.log("\n" + c("1;36", "▸ " + s));
const ok = (s) => console.log("  " + c("32", "✓") + " " + s);
const warn = (s) => console.log("  " + c("33", "!") + " " + s);
const die = (s) => {
  console.error("\n" + c("31", "✗ " + s) + "\n");
  process.exit(1);
};

/** Run a command inheriting stdio; returns true on success. */
function run(cmd, opts = {}) {
  const r = spawnSync(cmd, { stdio: "inherit", shell: true, cwd: ROOT, ...opts });
  return r.status === 0;
}
/** Run a command capturing stdout (empty string on failure). */
function capture(cmd) {
  const r = spawnSync(cmd, { shell: true, cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : "";
}
const genSecret = () => randomBytes(32).toString("hex");

/** Ensure an .env file has an ACTIVE key=value (append if missing; never overwrite). */
function ensureVar(file, key, value) {
  if (!existsSync(file)) writeFileSync(file, "");
  const body = readFileSync(file, "utf8");
  if (new RegExp("^" + key + "=", "m").test(body)) return;
  appendFileSync(file, (body.endsWith("\n") || body === "" ? "" : "\n") + `${key}=${value}\n`);
  ok(`Definido ${key} en ${file.replace(ROOT + "/", "").replace(ROOT + "\\", "")}`);
}

/** Resolve a TCP connect within `ms`. */
function tcpOpen(host, port, ms = 1500) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port });
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(ms);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Paso 1: prerequisitos + env ──────────────────────────────────────────────
step("Paso 1 · Prerequisitos y variables de entorno");

if (!capture("node -v")) die("Falta Node.js 20+. Instálalo desde https://nodejs.org");
ok("Node " + capture("node -v"));

if (!capture("pnpm -v")) {
  warn("pnpm no está disponible; intento activarlo con corepack…");
  run("corepack enable");
  run("corepack prepare pnpm@10.33.0 --activate");
}
if (!capture("pnpm -v")) die("Falta pnpm. Instálalo con: corepack enable   (o npm i -g pnpm)");
ok("pnpm " + capture("pnpm -v"));

const apiEnv = join(ROOT, "apps", "api", ".env");
if (!existsSync(apiEnv)) {
  copyFileSync(join(ROOT, "apps", "api", ".env.example"), apiEnv);
  ok("Creado apps/api/.env a partir del ejemplo");
}
ensureVar(apiEnv, "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/nvcore?schema=public");
ensureVar(apiEnv, "JWT_SECRET", genSecret());
ensureVar(apiEnv, "ENCRYPTION_KEY", genSecret());
ensureVar(join(ROOT, "apps", "web", ".env"), "VITE_API_URL", "http://localhost:4000");

// Read the effective DATABASE_URL back.
const dbLine = (readFileSync(apiEnv, "utf8").match(/^DATABASE_URL=(.*)$/m) || [])[1] || "";
if (!dbLine) die("DATABASE_URL vacío en apps/api/.env. Defínelo y reintenta.");
let db;
try {
  db = new URL(dbLine);
} catch {
  die("DATABASE_URL con formato inválido en apps/api/.env: " + dbLine);
}
const dbHost = db.hostname;
const dbPort = Number(db.port || 5432);
const dbUser = decodeURIComponent(db.username || "postgres");
const dbPass = decodeURIComponent(db.password || "postgres");
const dbName = (db.pathname || "/nvcore").replace(/^\//, "") || "nvcore";
const isLocalDb = dbHost === "localhost" || dbHost === "127.0.0.1";

// ── Paso 2: PostgreSQL de desarrollo ─────────────────────────────────────────
step("Paso 2 · Base de datos PostgreSQL");
let dbReady = await tcpOpen(dbHost, dbPort);

if (dbReady) {
  ok(`PostgreSQL responde en ${dbHost}:${dbPort}`);
} else if (NO_DB) {
  warn(`--no-db: no gestiono Postgres y no responde en ${dbHost}:${dbPort}. La migración puede fallar.`);
} else if (!isLocalDb) {
  warn(`No respondo por un Postgres remoto (${dbHost}). Asegúrate de que sea accesible.`);
} else {
  // Levantar Postgres en Docker con puerto al host, con las credenciales del URL.
  const dockerOk = Boolean(capture("docker --version")) && Boolean(capture("docker info"));
  if (!dockerOk) {
    die(
      `No hay PostgreSQL en ${dbHost}:${dbPort} y Docker no está disponible.\n` +
        `  Opciones:\n` +
        `   • Inicia Docker Desktop y reintenta (levanto Postgres yo), o\n` +
        `   • Instala PostgreSQL y crea la BD '${dbName}' (usuario '${dbUser}'), o\n` +
        `   • Edita apps/api/.env con tu DATABASE_URL y reintenta.`,
    );
  }
  const NAME = "nvcore-dev-db";
  const existing = capture(`docker ps -a --filter "name=^/${NAME}$" --format "{{.Names}}"`);
  const running = capture(`docker ps --filter "name=^/${NAME}$" --format "{{.Names}}"`);
  if (running) {
    ok(`Contenedor ${NAME} ya está corriendo`);
  } else if (existing) {
    run(`docker start ${NAME}`);
    ok(`Contenedor ${NAME} iniciado`);
  } else {
    warn(`Levantando PostgreSQL en Docker (${NAME})…`);
    const created = run(
      `docker run -d --name ${NAME} ` +
        `-e POSTGRES_USER=${dbUser} -e POSTGRES_PASSWORD=${dbPass} -e POSTGRES_DB=${dbName} ` +
        `-p ${dbPort}:5432 postgres:16`,
    );
    if (!created) die(`No se pudo crear el contenedor ${NAME}. ¿Está el puerto ${dbPort} libre?`);
    ok(`Contenedor ${NAME} creado`);
  }
  // Esperar a que acepte conexiones.
  process.stdout.write("  Esperando a que Postgres acepte conexiones");
  for (let i = 0; i < 30 && !dbReady; i++) {
    await sleep(1000);
    process.stdout.write(".");
    dbReady = await tcpOpen(dbHost, dbPort, 1000);
  }
  process.stdout.write("\n");
  dbReady ? ok("PostgreSQL listo") : warn("Postgres tardó en responder; intentaré migrar de todos modos.");
}

// ── Paso 3: dependencias ─────────────────────────────────────────────────────
if (SKIP_INSTALL) {
  step("Paso 3 · Dependencias (omitido con --skip-install)");
} else {
  step("Paso 3 · Instalar dependencias");
  if (!run("pnpm install")) die("Falló pnpm install.");
  ok("Dependencias instaladas");
}

// ── Paso 4: base de datos (Prisma) ───────────────────────────────────────────
step("Paso 4 · Preparar la base de datos (Prisma)");
if (!run("pnpm --filter @nv/api exec prisma generate")) die("Falló prisma generate.");
ok("Cliente Prisma generado");

let migrated = false;
for (let i = 1; i <= 3 && !migrated; i++) {
  migrated = run("pnpm --filter @nv/api exec prisma migrate deploy");
  if (!migrated && i < 3) {
    warn(`Migración falló (intento ${i}/3); reintento en 3s…`);
    await sleep(3000);
  }
}
if (!migrated) {
  die(
    "No se pudieron aplicar las migraciones.\n" +
      "  Revisa que Postgres esté arriba y que DATABASE_URL en apps/api/.env sea correcto.",
  );
}
ok("Migraciones aplicadas");

// ── Paso 5: arrancar ─────────────────────────────────────────────────────────
if (PREPARE_ONLY) {
  step("Listo (preparación completa)");
  console.log("  Levanta los servidores con: " + c("1", "pnpm dev"));
  console.log(`  Web: ${c("36", "http://localhost:3000")}   API: ${c("36", "http://localhost:4000/api")}`);
  process.exit(0);
}
step("Paso 5 · Levantar API (:4000) + Web (:3000)");
console.log(`  Web: ${c("36", "http://localhost:3000")}   API: ${c("36", "http://localhost:4000/api")}`);
console.log("  (Ctrl+C para detener)\n");
process.exit(run("pnpm dev") ? 0 : 1);
