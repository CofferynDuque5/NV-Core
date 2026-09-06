#!/usr/bin/env node
/**
 * Construye el front (SPA) listo para subir a un hosting.
 *
 *   pnpm desplegar:web                      → build en modo demo (se ve, sin datos reales)
 *   pnpm desplegar:web https://api.tudominio.com   → build apuntando a tu API real
 *
 * Resultado: la carpeta apps/web/dist/ con TODO lo que hay que subir a public_html
 * (incluye un .htaccess para que las rutas funcionen en Apache). Sube el CONTENIDO
 * de esa carpeta, no la carpeta en sí.
 *
 * IMPORTANTE: no subas el repositorio (apps/, packages/, scripts/…) al hosting.
 * Eso es lo que produce el "Index of /" que ves. Sube solo apps/web/dist.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiUrl = process.argv[2]?.trim();

function run(cmd, env = {}) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
}

console.log("── NV Core · build para hosting ─────────────────────────────");
if (apiUrl) {
  if (!/^https?:\/\//.test(apiUrl)) {
    console.error(`\n✖ La URL de la API debe empezar por http:// o https:// — recibí: ${apiUrl}`);
    process.exit(1);
  }
  console.log(`API: ${apiUrl} (modo completo)`);
} else {
  console.log("API: (ninguna) → modo DEMO: la app se ve pero sin login ni datos reales.");
  console.log("   Para conectar tu backend:  pnpm desplegar:web https://api.tudominio.com");
}

// El front consume @nv/domain desde el código fuente, pero lo compilamos igual
// por si alguna herramienta lo necesita, y luego construimos el SPA.
run("pnpm --filter @nv/domain build");
run("pnpm --filter @nv/web build", apiUrl ? { VITE_API_URL: apiUrl } : {});

const dist = join(root, "apps/web/dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error("\n✖ No se generó apps/web/dist/index.html. Revisa los errores de arriba.");
  process.exit(1);
}

// Garantiza el .htaccess en el dist (Vite copia public/, pero lo aseguramos aquí).
const htaccessSrc = join(root, "apps/web/public/.htaccess");
const htaccessDst = join(dist, ".htaccess");
if (existsSync(htaccessSrc)) copyFileSync(htaccessSrc, htaccessDst);
if (!existsSync(htaccessDst)) {
  writeFileSync(
    htaccessDst,
    "<IfModule mod_rewrite.c>\n  RewriteEngine On\n  RewriteBase /\n  RewriteCond %{REQUEST_FILENAME} !-f\n  RewriteCond %{REQUEST_FILENAME} !-d\n  RewriteRule . /index.html [L]\n</IfModule>\n",
  );
}

// Aviso si el build quedó en demo (sin VITE_API_URL): lo detectamos por el bundle.
console.log("\n✔ Listo. Carpeta lista para subir:  apps/web/dist");
console.log("\nQué hacer ahora:");
console.log("  1) Abre apps/web/dist");
console.log("  2) Sube TODO su CONTENIDO (index.html, assets/, .htaccess, …) a public_html");
console.log("     (no subas la carpeta 'dist' en sí, ni el repositorio).");
console.log("  3) Si tu hosting oculta los archivos que empiezan por punto, activa 'mostrar");
console.log("     ocultos' para subir también el .htaccess (o créalo desde el panel).");
if (!apiUrl) {
  console.log("\nNota: sin API es solo una demo. Para que funcione de verdad (login, envíos,");
  console.log(
    "campañas) necesitas el backend (API + PostgreSQL) publicado y reconstruir con su URL.",
  );
  console.log("Guía completa: docs/DESPLIEGUE-HOSTING.md");
}
