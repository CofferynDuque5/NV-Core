#!/usr/bin/env node
/**
 * Conectar Ayrshare: guarda la API key en apps/api/.env. NUNCA se sube al
 * repositorio (.env está en .gitignore).
 *
 *   pnpm ayrshare TU_API_KEY                 # clave de la cuenta
 *   pnpm ayrshare TU_API_KEY TU_PROFILE_KEY  # Business plan (multi-cuenta)
 *
 * 1) Crea una cuenta gratis en https://www.ayrshare.com
 * 2) En el panel, vincula tu Facebook y/o Instagram (un par de clics).
 * 3) Copia tu API Key (Settings → API Key) y pégala aquí.
 * 4) Reinicia con `pnpm arrancar`. En Conexiones, elige el adaptador
 *    «Ayrshare» para Facebook e Instagram y ya podrás publicar.
 */
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiKey = (process.argv[2] || "").trim();
const profileKey = (process.argv[3] || "").trim();

if (!apiKey || apiKey.length < 12) {
  console.error("Uso: pnpm ayrshare <API_KEY> [PROFILE_KEY]");
  console.error("Consigue tu API Key gratis en https://www.ayrshare.com (Settings → API Key).");
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

setEnvVar(apiEnv, "AYRSHARE_API_KEY", apiKey);
if (profileKey) setEnvVar(apiEnv, "AYRSHARE_PROFILE_KEY", profileKey);

console.log("\n✓ API key de Ayrshare guardada en apps/api/.env (no se sube al repositorio).");
if (profileKey) console.log("✓ AYRSHARE_PROFILE_KEY guardada (Business plan / multi-cuenta).");
console.log("\nReinicia para aplicarlo:  pnpm arrancar");
console.log("Luego, en Conexiones → Facebook / Instagram elige el adaptador «Ayrshare».");
console.log("Recuerda vincular tus cuentas dentro del panel de Ayrshare primero.\n");
