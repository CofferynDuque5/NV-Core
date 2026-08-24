#!/usr/bin/env node
/**
 * Hazte administrador (Owner de todos los workspaces).
 *
 *   pnpm admin tu-correo@ejemplo.com
 *
 * Escribe NV_ADMIN_EMAIL en apps/api/.env. Al reiniciar la API (por ejemplo con
 * `pnpm arrancar`), el sembrado de admin encuentra tu usuario y te hace Owner de
 * todos los workspaces. Si el usuario aún no existe, define también una
 * contraseña con el 2º argumento y se creará:
 *
 *   pnpm admin tu-correo@ejemplo.com TuPassword123
 */
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const email = (process.argv[2] || "").trim().toLowerCase();
const password = (process.argv[3] || "").trim();

if (!email || !email.includes("@")) {
  console.error("Uso: pnpm admin tu-correo@ejemplo.com [contraseña-si-el-usuario-no-existe]");
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

setEnvVar(apiEnv, "NV_ADMIN_EMAIL", email);
if (password) setEnvVar(apiEnv, "NV_ADMIN_PASSWORD", password);

console.log(`\n✓ NV_ADMIN_EMAIL = ${email}  (guardado en apps/api/.env)`);
if (password) console.log(`✓ NV_ADMIN_PASSWORD actualizado (se usará solo si el usuario no existe aún)`);
console.log("\nAhora reinicia para aplicarlo:");
console.log("  pnpm arrancar\n");
console.log("Al arrancar, tu cuenta quedará como Owner de todos los workspaces.");
console.log("Nota: si el usuario YA existe, se respeta su contraseña actual (no se cambia).\n");
