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

/** Set an .env key (replace the line if present, else append). */
function setEnvVar(file, key, value) {
  let body = existsSync(file) ? readFileSync(file, "utf8") : "";
  const re = new RegExp("^" + key + "=.*$", "m");
  if (re.test(body)) body = body.replace(re, `${key}=${value}`);
  else body += (body.endsWith("\n") || body === "" ? "" : "\n") + `${key}=${value}\n`;
  writeFileSync(file, body);
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
// Admin de desarrollo: la API lo crea al arrancar (Owner de todos los
// workspaces) para que puedas iniciar sesión de una. Cámbialos en apps/api/.env.
ensureVar(apiEnv, "NV_ADMIN_EMAIL", "admin@nvcore.local");
ensureVar(apiEnv, "NV_ADMIN_PASSWORD", "Admin1234");
ensureVar(apiEnv, "NV_ADMIN_NAME", "Admin");
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

const NAME = "nvcore-dev-db"; // contenedor gestionado por este script

/** pg_isready dentro del contenedor gestionado (auth-capable, no solo TCP). */
function containerReady() {
  return capture(`docker exec ${NAME} pg_isready -U ${dbUser} -d ${dbName}`).includes("accepting");
}

if (NO_DB) {
  // El usuario gestiona su propia BD; solo comprobamos que responda.
  const up = await tcpOpen(dbHost, dbPort);
  up
    ? ok(`Usando tu PostgreSQL en ${dbHost}:${dbPort} (--no-db)`)
    : warn(`--no-db: nadie responde en ${dbHost}:${dbPort}. Ajusta DATABASE_URL en apps/api/.env.`);
} else if (!isLocalDb) {
  // BD remota declarada por el usuario: no la gestionamos.
  const up = await tcpOpen(dbHost, dbPort);
  up ? ok(`PostgreSQL remoto accesible (${dbHost}:${dbPort})`) : warn(`No respondo por ${dbHost}:${dbPort}.`);
} else {
  // Modo automático: gestionamos NUESTRO propio contenedor Docker. No asumimos
  // que "el puerto está abierto" signifique credenciales válidas — por eso no
  // reutilizamos un Postgres ajeno que ya escuche en el 5432.
  const dockerOk = Boolean(capture("docker --version")) && Boolean(capture("docker info"));
  if (!dockerOk) {
    die(
      `Necesito Docker para levantar PostgreSQL automáticamente, y no está disponible.\n` +
        `  Opciones:\n` +
        `   • Abre Docker Desktop y reintenta (levanto Postgres yo), o\n` +
        `   • Usa tu propio PostgreSQL: pon su DATABASE_URL en apps/api/.env y ejecuta 'pnpm arrancar --no-db'.`,
    );
  }

  const running = capture(`docker ps --filter "name=^/${NAME}$" --format "{{.Names}}"`);
  const exists = capture(`docker ps -a --filter "name=^/${NAME}$" --format "{{.Names}}"`);

  if (!running && exists) {
    run(`docker start ${NAME}`);
    ok(`Contenedor ${NAME} iniciado`);
  } else if (!exists) {
    // Elegir un puerto de host libre (evita chocar con un Postgres ya instalado).
    let port = null;
    for (const p of [dbPort, 5433, 5434, 5435, 5544]) {
      if (!(await tcpOpen("127.0.0.1", p, 700))) {
        port = p;
        break;
      }
    }
    if (!port) die("No encontré un puerto libre para PostgreSQL (probé 5432-5435, 5544).");
    if (port !== dbPort) warn(`El puerto ${dbPort} está ocupado; usaré ${port} para el Postgres de NV Core.`);
    warn(`Levantando PostgreSQL en Docker (${NAME}, puerto ${port})…`);
    const created = run(
      `docker run -d --name ${NAME} ` +
        `-e POSTGRES_USER=${dbUser} -e POSTGRES_PASSWORD=${dbPass} -e POSTGRES_DB=${dbName} ` +
        `-p ${port}:5432 postgres:16`,
    );
    if (!created) die(`No se pudo crear el contenedor ${NAME}.`);
    ok(`Contenedor ${NAME} creado`);
  } else {
    ok(`Contenedor ${NAME} ya está corriendo`);
  }

  // Puerto real publicado por el contenedor → alinear DATABASE_URL a él.
  const mapped = capture(`docker port ${NAME} 5432/tcp`); // ej. "0.0.0.0:5433"
  const realPort = Number((mapped.match(/:(\d+)\s*$/m) || mapped.match(/:(\d+)/) || [])[1] || dbPort);
  if (realPort !== dbPort) {
    const url = `postgresql://${dbUser}:${dbPass}@localhost:${realPort}/${dbName}?schema=public`;
    setEnvVar(apiEnv, "DATABASE_URL", url);
    process.env.DATABASE_URL = url;
    ok(`DATABASE_URL apuntando a localhost:${realPort} (contenedor gestionado)`);
  }

  // Esperar a que Postgres acepte conexiones AUTENTICADAS (pg_isready).
  process.stdout.write("  Esperando a que PostgreSQL esté listo");
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(1000);
    process.stdout.write(".");
    ready = containerReady();
  }
  process.stdout.write("\n");
  ready ? ok("PostgreSQL listo") : warn("Postgres tardó en responder; intentaré migrar de todos modos.");
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

// ── Puertos de los servidores (evitar choques con servicios ya abiertos) ──────
const apiPort = Number((readFileSync(apiEnv, "utf8").match(/^PORT=(\d+)/m) || [])[1] || 4000);
let webPort = 3000;
for (const p of [3000, 3001, 3002, 3003, 3004]) {
  if (!(await tcpOpen("127.0.0.1", p, 600))) {
    webPort = p;
    break;
  }
}
if (webPort !== 3000) {
  warn(`El puerto 3000 está ocupado por otro programa; la Web usará el ${webPort}.`);
  // Mantener CORS y los enlaces alineados con el puerto real de la Web.
  setEnvVar(apiEnv, "CORS_ORIGINS", `http://localhost:${webPort}`);
  setEnvVar(apiEnv, "APP_URL", `http://localhost:${webPort}`);
}
process.env.WEB_PORT = String(webPort);
// La Web habla con la API por su URL (no por el puerto de la Web).
setEnvVar(join(ROOT, "apps", "web", ".env"), "VITE_API_URL", `http://localhost:${apiPort}`);

const webUrl = `http://localhost:${webPort}`;
const apiUrl = `http://localhost:${apiPort}/api`;

// Credenciales del admin (para mostrarlas; el usuario pudo cambiarlas).
const envNow = readFileSync(apiEnv, "utf8");
const adminEmail = (envNow.match(/^NV_ADMIN_EMAIL=(.*)$/m) || [])[1] || "";
const adminPass = (envNow.match(/^NV_ADMIN_PASSWORD=(.*)$/m) || [])[1] || "";
const printLogin = () => {
  if (!adminEmail || !adminPass) return;
  console.log(`  ${c("1", "Inicia sesión con:")}  ${c("32", adminEmail)}  /  ${c("32", adminPass)}`);
};

// ── Paso 5: arrancar ─────────────────────────────────────────────────────────
if (PREPARE_ONLY) {
  step("Listo (preparación completa)");
  console.log("  Levanta los servidores con: " + c("1", "pnpm dev"));
  console.log(`  Web: ${c("36", webUrl)}   API: ${c("36", apiUrl)}`);
  printLogin();
  process.exit(0);
}
step(`Paso 5 · Levantar API (:${apiPort}) + Web (:${webPort})`);
console.log(`  ${c("1", "Abre en el navegador:")} ${c("36", webUrl)}`);
printLogin();
console.log(`  API: ${c("36", apiUrl)}    (Ctrl+C para detener)\n`);
process.exit(run("pnpm dev") ? 0 : 1);
