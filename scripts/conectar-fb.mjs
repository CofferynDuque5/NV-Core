#!/usr/bin/env node
/**
 * Conectar Facebook: guarda el token (y opcionalmente el Page ID) en
 * apps/api/.env. NUNCA se sube al repositorio (.env está en .gitignore).
 *
 *   pnpm fb EAAG...tu_token            # resuelve la Página automáticamente
 *   pnpm fb EAAG...tu_token 123456789  # si ya conoces el Page ID
 *
 * Después reinicia con `pnpm arrancar`. En Conexiones, Facebook aparecerá
 * conectado y podrás publicar.
 */
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const token = (process.argv[2] || "").trim();
const pageId = (process.argv[3] || "").trim();

if (!token || token.length < 20) {
  console.error("Uso: pnpm fb <token-de-facebook> [pageId]");
  process.exit(2);
}

const apiEnv = join(ROOT, "apps", "api", ".env");
if (!existsSync(apiEnv)) copyFileSync(join(ROOT, "apps", "api", ".env.example"), apiEnv);

function setEnvVar(file, key, value) {
  let body = readFileSync(file, "utf8");
  const re = new RegExp("^" + key + "=.*$", "m");
  if (re.test(body)) body = body.replace(re, `${key}=${value}`);
  else body += (body.endsWith("\n") || body === "" ? "" : "\n") + `${key}=${value}\n`;
  writeFileSync(file, body);
}

setEnvVar(apiEnv, "FB_PAGE_TOKEN", token);
if (pageId) setEnvVar(apiEnv, "FB_PAGE_ID", pageId);

console.log("\n✓ Token de Facebook guardado en apps/api/.env (no se sube al repositorio).");
if (pageId) console.log(`✓ FB_PAGE_ID = ${pageId}`);
else console.log("• Sin Page ID: la API resolverá tu Página automáticamente desde el token.");
console.log("\nReinicia para aplicarlo:  pnpm arrancar");
console.log("Luego, en Conexiones → Facebook debería salir «conectado».\n");
