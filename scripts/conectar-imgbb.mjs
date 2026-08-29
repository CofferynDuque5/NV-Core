#!/usr/bin/env node
/**
 * Configurar ImgBB (hosting de imágenes para flyers y adjuntos).
 *
 *   pnpm imgbb <api_key>
 *
 * Guarda IMGBB_API_KEY en apps/api/.env (gitignored). Reinicia con
 * `pnpm arrancar`. Las imágenes (flyers IA, adjuntos) se subirán a ImgBB.
 * (ImgBB solo aloja imágenes; para video usa CLOUDINARY_URL.)
 */
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = (process.argv[2] || "").trim();
if (key.length < 8) {
  console.error("Uso: pnpm imgbb <api_key>   (tu clave de https://api.imgbb.com)");
  process.exit(2);
}

const apiEnv = join(ROOT, "apps", "api", ".env");
if (!existsSync(apiEnv)) copyFileSync(join(ROOT, "apps", "api", ".env.example"), apiEnv);

let body = readFileSync(apiEnv, "utf8");
const re = /^IMGBB_API_KEY=.*$/m;
if (re.test(body)) body = body.replace(re, `IMGBB_API_KEY=${key}`);
else body += (body.endsWith("\n") || body === "" ? "" : "\n") + `IMGBB_API_KEY=${key}\n`;
writeFileSync(apiEnv, body);

console.log("\n✓ IMGBB_API_KEY guardada en apps/api/.env (no se sube al repo).");
console.log("\nReinicia:  pnpm arrancar");
console.log("Ahora los flyers y adjuntos de imagen se suben a ImgBB.\n");
