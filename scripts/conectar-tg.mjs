#!/usr/bin/env node
/**
 * Configurar Telegram (cuenta / MTProto): guarda TELEGRAM_API_ID y
 * TELEGRAM_API_HASH en apps/api/.env. NUNCA se suben al repositorio
 * (.env está en .gitignore).
 *
 *   pnpm tg <api_id> <api_hash>
 *   ej: pnpm tg 12345678 cb881757b28eb29c3b5232044da6df18
 *
 * api_id y api_hash se obtienen en https://my.telegram.org → API development
 * tools. Después reinicia con `pnpm arrancar` y escanea el QR en
 * Conexiones → Telegram (cuenta).
 */
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiId = (process.argv[2] || "").trim();
const apiHash = (process.argv[3] || "").trim();

if (!/^\d{4,}$/.test(apiId) || apiHash.length < 20) {
  console.error("Uso: pnpm tg <api_id (número)> <api_hash>");
  console.error("Ej:  pnpm tg 12345678 cb881757b28eb29c3b5232044da6df18");
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

setEnvVar(apiEnv, "TELEGRAM_API_ID", apiId);
setEnvVar(apiEnv, "TELEGRAM_API_HASH", apiHash);

console.log("\n✓ TELEGRAM_API_ID y TELEGRAM_API_HASH guardados en apps/api/.env (no se suben al repo).");
console.log("\nReinicia:  pnpm arrancar");
console.log("Luego: Conexiones → Telegram (cuenta) → Conectar → escanea el QR");
console.log("(Telegram → Ajustes → Dispositivos → Vincular dispositivo).\n");
