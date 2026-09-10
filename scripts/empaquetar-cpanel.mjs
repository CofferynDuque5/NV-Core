#!/usr/bin/env node
/**
 * Empaqueta NV Core para "Setup Node.js App" de cPanel.
 *
 * Genera una carpeta AUTOINSTALABLE (deploy-cpanel/) y su zip, donde el MISMO
 * proceso Node sirve la API y la web en la misma URL (sin CORS ni config.js).
 * No incluye node_modules: cPanel los instala con "Run NPM Install" (y ahí Prisma
 * baja el motor correcto para el sistema del hosting).
 *
 *   pnpm cpanel      →  deploy-cpanel/  +  scratch/nvcore-cpanel-app.zip
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "deploy-cpanel");
const run = (cmd, env = {}) => {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
};

console.log("── NV Marketing · paquete para cPanel (Node.js App) ─────────");

// 1) Compilar dominio, API y web (web habla con la MISMA URL que la sirve).
run("pnpm --filter @nv/domain build");
run("pnpm --filter @nv/api prisma:generate");
run("pnpm --filter @nv/api build");
run("pnpm --filter @nv/web build", { VITE_API_URL: "same-origin" });

// 2) Armar la carpeta de despliegue.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "apps/api/dist"), join(out, "dist"), { recursive: true });
cpSync(join(root, "apps/api/prisma"), join(out, "prisma"), { recursive: true });
cpSync(join(root, "apps/web/dist"), join(out, "web"), { recursive: true });
// @nv/domain como dependencia local (file:./vendor/domain). Se escribe un
// package.json MÍNIMO de runtime (sin scripts 'prepare'/build ni devDeps con
// "workspace:*", que romperían el npm install de cPanel; el dist ya viene hecho).
mkdirSync(join(out, "vendor/domain"), { recursive: true });
cpSync(join(root, "packages/domain/dist"), join(out, "vendor/domain/dist"), { recursive: true });
const domainPkg = JSON.parse(readFileSync(join(root, "packages/domain/package.json"), "utf8"));
writeFileSync(
  join(out, "vendor/domain/package.json"),
  JSON.stringify(
    {
      name: domainPkg.name,
      version: domainPkg.version || "0.0.0",
      private: true,
      main: domainPkg.main ?? "./dist/index.js",
      types: domainPkg.types ?? "./dist/index.d.ts",
      exports: domainPkg.exports,
      files: ["dist"],
    },
    null,
    2,
  ) + "\n",
);

// 3) package.json autónomo (instalable con npm, sin workspaces).
const apiPkg = JSON.parse(readFileSync(join(root, "apps/api/package.json"), "utf8"));
const deps = { ...apiPkg.dependencies };
// IMPORTANTE: NO declaramos @nv/domain como dependencia. El protocolo "file:"
// rompe el "npm install" de cPanel (EUNSUPPORTEDPROTOCOL) y aborta la instalación
// a la mitad (quedan sin instalar rxjs, reflect-metadata, prisma…). No hace falta:
// passenger-start.js resuelve @nv/domain con un alias hacia ./vendor/domain, así
// que el require funciona igual sin que esté en node_modules.
delete deps["@nv/domain"];
const pkg = {
  name: "nvmarketing-app",
  version: "1.0.0",
  private: true,
  engines: { node: ">=20" },
  // Sin 'postinstall': cPanel ejecuta el install desde el venv (otra cwd), y una
  // ruta relativa a prisma/schema.prisma falla. La generación de Prisma se hace
  // en passenger-start.js al arrancar, con ruta ABSOLUTA (siempre funciona).
  scripts: {
    start: "node passenger-start.js",
  },
  dependencies: {
    ...deps,
    prisma: "6.19.3", // CLI a juego con @prisma/client (para generate + migrate)
    // Cliente Postgres en JS puro: aplica las migraciones al arrancar sin depender
    // del "schema engine" nativo de Prisma (que es específico de la plataforma y no
    // se puede empaquetar de forma cruzada). Funciona en cualquier hosting.
    pg: "8.13.1",
  },
  // cPanel usa npm (que sí ejecuta los scripts). Esto es por si alguien instala
  // con pnpm: le permite correr los build scripts que pnpm bloquea por defecto
  // (Prisma genera el motor; el resto son optimizaciones nativas opcionales).
  pnpm: {
    onlyBuiltDependencies: [
      "@prisma/client",
      "@prisma/engines",
      "prisma",
      "@whiskeysockets/baileys",
      "protobufjs",
      "es5-ext",
      "bufferutil",
      "utf-8-validate",
      "msgpackr-extract",
      "@scarf/scarf",
    ],
  },
};
writeFileSync(join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

// 4) Arranque para Passenger: aplica migraciones y levanta la API (que sirve la web).
writeFileSync(
  join(out, "passenger-start.js"),
  `// Arranque de NV Marketing bajo Passenger (cPanel "Setup Node.js App").
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const { execSync } = require("node:child_process");

process.env.NODE_ENV = process.env.NODE_ENV || "production";
// El mismo proceso sirve la web (SPA) en la misma URL que la API.
process.env.WEB_DIST = process.env.WEB_DIST || path.join(__dirname, "web");

// ── Resolver @nv/domain SIN depender de cómo cPanel instale los paquetes ──
// En CloudLinux, npm instala en un venv aparte y node_modules del app-root es un
// symlink; el paquete local "file:./vendor/domain" a veces no queda resoluble.
// Lo aliaseamos a mano contra ./vendor/domain para que require("@nv/domain")
// siempre funcione, se haya instalado como se haya instalado.
(function aliasDomain() {
  const domainRoot = path.join(__dirname, "vendor", "domain");
  const domainMain = path.join(domainRoot, "dist", "index.js");
  if (!fs.existsSync(domainMain)) return;
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === "@nv/domain") return domainMain;
    if (request.startsWith("@nv/domain/")) {
      const sub = request.slice("@nv/domain/".length);
      const cand = path.join(domainRoot, "dist", sub);
      for (const p of [cand, cand + ".js", path.join(cand, "index.js")]) {
        if (fs.existsSync(p)) return p;
      }
    }
    return orig.call(this, request, parent, isMain, options);
  };
})();

// Localiza el CLI de Prisma de forma robusta: primero el paquete instalado
// (donde sea que cPanel lo haya puesto), y como respaldo el .bin clásico.
function resolvePrismaCli() {
  try {
    const pkg = require.resolve("prisma/package.json", { paths: [__dirname] });
    const cli = path.join(path.dirname(pkg), "build", "index.js");
    if (fs.existsSync(cli)) return { file: cli, viaNode: true };
  } catch (_) {
    /* seguimos con el respaldo */
  }
  const bin = path.join(__dirname, "node_modules", ".bin", "prisma");
  return { file: bin, viaNode: false };
}

// Autocorrige DATABASE_URL: tolera errores comunes al pegarla en el panel
// (sslmode duplicado, un segundo '?', channel_binding, falta de sslmode).
function sanitizeDbUrl(raw) {
  if (!raw) return raw;
  const s = String(raw).trim();
  const isLocal = s.includes("localhost") || s.includes("127.0.0.1");
  const i = s.indexOf("?");
  if (i === -1) return isLocal ? s : s + "?sslmode=require";
  const base = s.slice(0, i);
  const query = s.slice(i + 1).replace(/\\?/g, "&");
  const params = [];
  const seen = new Set();
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    const v = eq === -1 ? "" : pair.slice(eq + 1);
    if (k === "channel_binding") continue;
    if (seen.has(k)) continue;
    seen.add(k);
    params.push([k, v]);
  }
  if (!isLocal && !seen.has("sslmode")) params.push(["sslmode", "require"]);
  const qs = params.map(([k, v]) => (v === "" ? k : k + "=" + v)).join("&");
  return qs ? base + "?" + qs : base;
}
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = sanitizeDbUrl(process.env.DATABASE_URL);
}
// Para MIGRAR, Neon recomienda la conexión DIRECTA (sin "-pooler").
const migrateUrl = (process.env.DATABASE_URL || "").replace("-pooler.", ".");

const schema = path.join(__dirname, "prisma", "schema.prisma");
const q = (s) => JSON.stringify(s);

// Genera el cliente de Prisma SOLO si no viene ya generado (el paquete con
// node_modules incluido ya lo trae). Best-effort: si falla, la app igual arranca.
function ensurePrismaClient() {
  try {
    require.resolve(".prisma/client/default", { paths: [__dirname] });
    return; // ya está generado
  } catch (_) {
    /* hay que generarlo */
  }
  try {
    const pkg = require.resolve("prisma/package.json", { paths: [__dirname] });
    const cliFile = path.join(path.dirname(pkg), "build", "index.js");
    execSync(q(process.execPath) + " " + q(cliFile) + " generate --schema=" + q(schema), {
      cwd: __dirname,
      stdio: "inherit",
    });
  } catch (e) {
    console.error("[nvmarketing] 'prisma generate' omitido:", e.message);
  }
}

// Aplica las migraciones con pg (JavaScript puro): funciona en cualquier
// plataforma, sin depender del motor nativo de Prisma (que es específico del SO
// y no se puede empaquetar de forma cruzada). Devuelve promesa, o null si no hay pg.
function migrateWithPg() {
  let Client;
  try {
    Client = require("pg").Client;
  } catch (_) {
    return null;
  }
  const crypto = require("node:crypto");
  const migDir = path.join(__dirname, "prisma", "migrations");
  if (!fs.existsSync(migDir)) return null;
  const folders = fs
    .readdirSync(migDir)
    .filter((f) => fs.existsSync(path.join(migDir, f, "migration.sql")))
    .sort();
  const isLocal = /localhost|127\\.0\\.0\\.1/.test(migrateUrl);
  return (async () => {
    const client = new Client({
      connectionString: migrateUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query(
      'CREATE TABLE IF NOT EXISTS "_prisma_migrations" (id varchar(36) PRIMARY KEY NOT NULL, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)',
    );
    const doneRes = await client.query(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
    );
    const done = new Set(doneRes.rows.map((r) => r.migration_name));
    for (const name of folders) {
      if (done.has(name)) continue;
      const sql = fs.readFileSync(path.join(migDir, name, "migration.sql"), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          'INSERT INTO "_prisma_migrations"(id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ($1,$2,$3,now(),now(),1)',
          [crypto.randomUUID(), checksum, name],
        );
        await client.query("COMMIT");
        console.log("[nvmarketing] migración aplicada:", name);
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        await client.end().catch(() => {});
        throw new Error("Migración " + name + " falló: " + e.message);
      }
    }
    await client.end();
    console.log("[nvmarketing] base de datos al día.");
  })();
}

// Fallback: prisma migrate deploy por CLI (cuando el motor nativo SÍ está,
// p.ej. si el hosting instaló las dependencias por su cuenta).
function migrateWithPrismaCli() {
  let cliFile;
  try {
    const pkg = require.resolve("prisma/package.json", { paths: [__dirname] });
    cliFile = path.join(path.dirname(pkg), "build", "index.js");
  } catch (_) {
    return;
  }
  for (let intento = 1; intento <= 3; intento++) {
    try {
      execSync(q(process.execPath) + " " + q(cliFile) + " migrate deploy --schema=" + q(schema), {
        cwd: __dirname,
        stdio: "inherit",
        env: Object.assign({}, process.env, { DATABASE_URL: migrateUrl }),
      });
      return;
    } catch (e) {
      console.error(
        "[nvmarketing] 'prisma migrate deploy' intento " + intento + " falló:",
        e.message,
      );
    }
  }
}

// ── Autoinstalación de dependencias (para hosting SIN terminal) ──
// Si node_modules quedó incompleto (el botón "Run NPM Install" de cPanel a veces
// no termina), instalamos las dependencias solas en segundo plano y mostramos una
// página de "instalando" mientras tanto. Al terminar, la app arranca sola.
function depsReady() {
  // Comprobación por FILESYSTEM (no require.resolve): un proceso que arrancó sin
  // node_modules cachea el "no existe" y no vería los paquetes recién instalados.
  // fs.existsSync siempre mira el disco real (y sigue symlinks del venv).
  const nm = path.join(__dirname, "node_modules");
  return (
    fs.existsSync(path.join(nm, "reflect-metadata", "package.json")) &&
    fs.existsSync(path.join(nm, "@nestjs", "common", "package.json")) &&
    fs.existsSync(path.join(nm, "@prisma", "client", "package.json"))
  );
}

function findNpmCli() {
  const base = path.dirname(process.execPath); // .../<ver>/bin
  const cands = [
    path.join(base, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(base, "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const c of cands) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (_) {
      /* seguir */
    }
  }
  return null;
}

function serveInstalling() {
  const http = require("node:http");
  const page =
    "<!doctype html><meta charset=utf-8><title>Instalando NV Marketing…</title>" +
    "<meta http-equiv=refresh content=15>" +
    "<div style='font-family:system-ui,Segoe UI,Arial;max-width:560px;margin:12vh auto;text-align:center;color:#0B0D10'>" +
    "<h1 style='font-size:22px;margin:0 0 8px'>Instalando NV Marketing…</h1>" +
    "<p style='color:#555;line-height:1.5'>Estamos preparando la aplicación por primera vez " +
    "(suele tardar 1–3 minutos). Esta página se recarga sola; no cierres la pestaña.</p></div>";
  const server = http.createServer((_req, res) => {
    res.writeHead(503, { "content-type": "text/html; charset=utf-8", "retry-after": "20" });
    res.end(page);
  });
  server.listen(process.env.PORT || 3000);
}

function startAutoInstall() {
  const npmCli = findNpmCli();
  if (!npmCli) {
    console.error("[nvmarketing] No encontré npm para autoinstalar. Sube el paquete con node_modules o instala por terminal.");
    return;
  }
  const lock = path.join(__dirname, ".nv-installing.lock");
  try {
    const st = fs.existsSync(lock) ? fs.statSync(lock) : null;
    if (st && Date.now() - st.mtimeMs < 10 * 60 * 1000) return; // ya hay una corriendo
  } catch (_) {
    /* seguir */
  }
  try {
    fs.writeFileSync(lock, String(Date.now()));
  } catch (_) {
    /* seguir */
  }
  const { spawn } = require("node:child_process");
  console.log("[nvmarketing] Instalando dependencias automáticamente (npm install)…");
  // Detached + unref: sobrevive aunque Passenger reinicie este proceso.
  const child = spawn(
    process.execPath,
    [npmCli, "install", "--omit=dev", "--no-audit", "--no-fund"],
    { cwd: __dirname, detached: true, stdio: "inherit" },
  );
  child.on("exit", () => {
    try {
      fs.unlinkSync(lock);
    } catch (_) {
      /* seguir */
    }
  });
  child.unref();
}

(async () => {
  // Si faltan dependencias, autoinstalar y servir "instalando" hasta que estén.
  if (!depsReady()) {
    serveInstalling();
    startAutoInstall();
    const timer = setInterval(() => {
      if (depsReady()) {
        clearInterval(timer);
        process.exit(0); // Passenger reinicia y ya carga la app real.
      }
    }, 5000);
    return;
  }

  ensurePrismaClient();
  try {
    const pgRun = migrateWithPg();
    if (pgRun) await pgRun;
    else migrateWithPrismaCli();
  } catch (e) {
    console.error("[nvmarketing] migraciones:", e.message);
  }
  require("./dist/main.js");
})();
`,
);

// 5) .env de ejemplo + instrucciones.
writeFileSync(
  join(out, ".env.example"),
  `# Renómbralo a .env (o define estas variables en el panel "Setup Node.js App").
# OBLIGATORIAS
DATABASE_URL=postgresql://usuario:password@host/db?sslmode=require
JWT_SECRET=pon-aqui-un-texto-largo-de-mas-de-32-caracteres-xxxxx
ENCRYPTION_KEY=otro-texto-largo-de-mas-de-32-caracteres-yyyyyyyyy
NODE_ENV=production
# Tu correo de admin (para el primer acceso)
NV_ADMIN_EMAIL=tucorreo@ejemplo.com

# OPCIONALES (ponlas cuando las tengas)
# IMGBB_API_KEY=
# TELEGRAM_API_ID=
# TELEGRAM_API_HASH=
# STRIPE_SECRET_KEY=
# OPENAI_API_KEY=
# RESEND_API_KEY=
`,
);

// 4b) .htaccess de Passenger. cPanel lo genera al crear la app; pero si el
// usuario vacía la carpeta al subir, se pierde y LiteSpeed muestra "Index of /".
// Para que el paquete quede autosuficiente, escribimos:
//   - un .htaccess REAL cuando se pasan las rutas del hosting por variables
//     (CPANEL_APP_ROOT + CPANEL_NODE_BIN), y
//   - siempre un .htaccess.EJEMPLO con instrucciones.
const passengerBlock = (appRoot, nodeBin) =>
  `# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN
PassengerAppRoot "${appRoot}"
PassengerBaseURI "/"
PassengerNodejs "${nodeBin}"
PassengerAppType node
PassengerStartupFile passenger-start.js
# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END

# Evita el listado de carpeta si Passenger no estuviera activo.
Options -Indexes
`;
const cpAppRoot = process.env.CPANEL_APP_ROOT;
const cpNodeBin = process.env.CPANEL_NODE_BIN;
if (cpAppRoot && cpNodeBin) {
  writeFileSync(join(out, ".htaccess"), passengerBlock(cpAppRoot, cpNodeBin));
  console.log(`✔ .htaccess generado para ${cpAppRoot}`);
}
writeFileSync(
  join(out, ".htaccess.EJEMPLO"),
  `Este es el .htaccess que activa tu app Node en cPanel (Passenger/LiteSpeed).
Normalmente cPanel lo crea solo al "Create Application"; si vaciaste la carpeta
y desapareció, verás "Index of /". Crea un archivo llamado .htaccess (con el
punto) en la carpeta de la app y pega esto, cambiando las DOS rutas por las de
tu hosting (las ves en "Setup Node.js App", en la línea "source .../bin/activate"):

${passengerBlock(
  "/home/USUARIO/public_html/tu-subdominio.com",
  "/home/USUARIO/nodevenv/public_html/tu-subdominio.com/20/bin/node",
)}`,
);
writeFileSync(
  join(out, "LEEME-CPANEL.txt"),
  `NV Marketing — despliegue en cPanel (Setup Node.js App)
=======================================================

Requisitos: una base de datos PostgreSQL (gratis en neon.tech o supabase.com).

PASOS
1) Sube el CONTENIDO de esta carpeta a la carpeta de tu subdominio, p.ej.
   /home/USUARIO/nvmarketingpanel.tudominio.com. Puedes subir el zip y extraerlo ahí.
2) cPanel → "Setup Node.js App" → Create Application:
      - Node.js version: 20 o 22
      - Application mode: Production
      - Application root: la carpeta donde subiste esto (la del subdominio)
      - Application URL: tu subdominio
      - Application startup file: passenger-start.js
3) En esa misma pantalla, sección "Environment variables", agrega:
      DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, NODE_ENV=production, NV_ADMIN_EMAIL
   (ver .env.example). Guarda.
4) Si este paquete YA trae la carpeta "node_modules" (versión con dependencias
   incluidas): NO pulses "Run NPM Install". Ve directo al paso 5.
   Si NO trae node_modules: pulsa "Run NPM Install" y espera a que termine.
5) Pulsa "Restart". Abre tu dominio: la web y el login ya funcionan de verdad.

Notas:
- El mismo proceso sirve la API y la web en la misma URL (sin CORS, sin config.js).
- Las migraciones de la base se aplican solas al arrancar.
- Para WhatsApp/Telegram e IA, añade sus claves como variables de entorno y reinicia.
`,
);

// 5b) OPCIONAL: dejar node_modules YA INSTALADO dentro del paquete, para hostings
// donde "Run NPM Install" falla o queda a medias. Se activa con CPANEL_BUNDLE_MODULES=1.
// Instala solo dependencias de producción y genera el cliente de Prisma con los
// motores de las plataformas típicas de cPanel (CloudLinux = RHEL; + Debian), para
// que el binario del motor exista sin necesidad de generar en el servidor.
if (process.env.CPANEL_BUNDLE_MODULES === "1") {
  console.log("\n▶ Instalando dependencias de producción dentro del paquete…");
  execSync("npm install --omit=dev --no-audit --no-fund --ignore-scripts", {
    cwd: out,
    stdio: "inherit",
  });
  // Añade binaryTargets al schema del paquete para cubrir CloudLinux (RHEL) y Debian.
  const schemaPath = join(out, "prisma/schema.prisma");
  let schema = readFileSync(schemaPath, "utf8");
  if (!schema.includes("binaryTargets")) {
    schema = schema.replace(
      /generator\s+client\s*\{/,
      `generator client {\n  binaryTargets = ["rhel-openssl-3.0.x", "rhel-openssl-1.1.x"]`,
    );
    writeFileSync(schemaPath, schema);
  }
  console.log("▶ Generando el cliente de Prisma (con motores de Linux para el hosting)…");
  execSync(
    `node ${JSON.stringify(join(out, "node_modules/prisma/build/index.js"))} generate --schema=${JSON.stringify(schemaPath)}`,
    { cwd: out, stdio: "inherit" },
  );
  console.log("✔ node_modules incluido en el paquete (no hace falta 'Run NPM Install').");
}

// 6) Zip para subir fácil.
const scratch = process.env.NV_SCRATCH || join(root, "scratch");
mkdirSync(scratch, { recursive: true });
const zip = join(scratch, "NV-Marketing-PANEL-cpanel.zip");
rmSync(zip, { force: true });
execSync(`cd ${JSON.stringify(out)} && zip -rq ${JSON.stringify(zip)} .`, { stdio: "inherit" });

console.log(`\n✔ Paquete listo: ${out}`);
console.log(`✔ Zip para subir: ${zip}`);
if (!existsSync(zip)) process.exit(1);
