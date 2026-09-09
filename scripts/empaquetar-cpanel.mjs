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

console.log("── NV Core · paquete para cPanel (Node.js App) ──────────────");

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
delete deps["@nv/domain"];
const pkg = {
  name: "nvcore-app",
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
    "@nv/domain": "file:./vendor/domain",
    prisma: "6.19.3", // CLI a juego con @prisma/client (para generate + migrate)
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
  `// Arranque de NV Core bajo Passenger (cPanel "Setup Node.js App").
const path = require("node:path");
const { execSync } = require("node:child_process");

process.env.NODE_ENV = process.env.NODE_ENV || "production";
// El mismo proceso sirve la web (SPA) en la misma URL que la API.
process.env.WEB_DIST = process.env.WEB_DIST || path.join(__dirname, "web");

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

const prisma = path.join(__dirname, "node_modules", ".bin", "prisma");
const schema = path.join(__dirname, "prisma", "schema.prisma");
const q = (s) => JSON.stringify(s);

// 1) Genera el cliente de Prisma con ruta ABSOLUTA (cPanel corre el install en
//    otra carpeta, por eso no se hace en postinstall). Idempotente.
try {
  execSync(q(prisma) + " generate --schema=" + q(schema), { cwd: __dirname, stdio: "inherit" });
} catch (e) {
  console.error("[nvcore] 'prisma generate' falló:", e.message);
}

// 2) Aplica las migraciones al arrancar (idempotente), con reintentos y usando
//    la conexión directa para migrar. Si falla, la app arranca igual y lo avisa.
for (let intento = 1; intento <= 3; intento++) {
  try {
    execSync(q(prisma) + " migrate deploy --schema=" + q(schema), {
      cwd: __dirname,
      stdio: "inherit",
      env: Object.assign({}, process.env, { DATABASE_URL: migrateUrl }),
    });
    break;
  } catch (e) {
    console.error("[nvcore] 'prisma migrate deploy' intento " + intento + " falló:", e.message);
  }
}

require("./dist/main.js");
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
writeFileSync(
  join(out, "LEEME-CPANEL.txt"),
  `NV Core — despliegue en cPanel (Setup Node.js App)
==================================================

Requisitos: una base de datos PostgreSQL (gratis en neon.tech o supabase.com).

PASOS
1) Sube el CONTENIDO de esta carpeta a una carpeta del hosting, p.ej. /home/USUARIO/nvcore
   (NO a public_html). Puedes subir el zip y extraerlo ahí.
2) cPanel → "Setup Node.js App" → Create Application:
      - Node.js version: 20 o 22
      - Application mode: Production
      - Application root: nvcore   (la carpeta donde subiste esto)
      - Application URL: tu dominio o subdominio
      - Application startup file: passenger-start.js
3) En esa misma pantalla, sección "Environment variables", agrega:
      DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, NODE_ENV=production, NV_ADMIN_EMAIL
   (ver .env.example). Guarda.
4) Pulsa "Run NPM Install" (instala dependencias y genera Prisma para tu servidor).
5) Pulsa "Restart". Abre tu dominio: la web y el login ya funcionan de verdad.

Notas:
- El mismo proceso sirve la API y la web en la misma URL (sin CORS, sin config.js).
- Las migraciones de la base se aplican solas al arrancar.
- Para WhatsApp/Telegram e IA, añade sus claves como variables de entorno y reinicia.
`,
);

// 6) Zip para subir fácil.
const scratch = process.env.NV_SCRATCH || join(root, "scratch");
mkdirSync(scratch, { recursive: true });
const zip = join(scratch, "nvcore-cpanel-app.zip");
rmSync(zip, { force: true });
execSync(`cd ${JSON.stringify(out)} && zip -rq ${JSON.stringify(zip)} .`, { stdio: "inherit" });

console.log(`\n✔ Paquete listo: ${out}`);
console.log(`✔ Zip para subir: ${zip}`);
if (!existsSync(zip)) process.exit(1);
