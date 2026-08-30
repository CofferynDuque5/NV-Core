#!/usr/bin/env node
/**
 * Conectar Stripe (facturación real): guarda las claves en apps/api/.env.
 * NUNCA se suben al repositorio (.env está en .gitignore).
 *
 *   pnpm stripe sk_test_...                          # solo la clave secreta
 *   pnpm stripe sk_test_... price_123                # + precio por defecto
 *   pnpm stripe sk_test_... price_123 whsec_...      # + firmante del webhook
 *
 * 1) Crea el producto/precio en https://dashboard.stripe.com (modo test primero).
 * 2) La clave secreta está en Developers → API keys (sk_test_… o sk_live_…).
 * 3) El webhook: crea uno en Developers → Webhooks apuntando a
 *      {API_URL}/api/integrations/stripe/webhook
 *    y copia su "Signing secret" (whsec_…).
 * 4) Reinicia con `pnpm arrancar`. En Configuración → Facturación podrás
 *    suscribirte y abrir el portal de cliente.
 */
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const secret = (process.argv[2] || "").trim();
const priceId = (process.argv[3] || "").trim();
const webhookSecret = (process.argv[4] || "").trim();

if (!secret || !/^sk_(test|live)_/.test(secret)) {
  console.error("Uso: pnpm stripe <STRIPE_SECRET_KEY> [PRICE_ID] [WEBHOOK_SECRET]");
  console.error("La clave secreta empieza por sk_test_ o sk_live_ (Dashboard → Developers → API keys).");
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

setEnvVar(apiEnv, "STRIPE_SECRET_KEY", secret);
if (priceId) setEnvVar(apiEnv, "STRIPE_PRICE_ID", priceId);
if (webhookSecret) setEnvVar(apiEnv, "STRIPE_WEBHOOK_SECRET", webhookSecret);

console.log("\n✓ Clave secreta de Stripe guardada en apps/api/.env (no se sube al repositorio).");
if (priceId) console.log(`✓ STRIPE_PRICE_ID = ${priceId}`);
else console.log("• Sin PRICE_ID: define uno o pásalo en el checkout para poder suscribir.");
if (webhookSecret) console.log("✓ STRIPE_WEBHOOK_SECRET guardado (sincroniza la suscripción).");
else
  console.log(
    "• Sin WEBHOOK_SECRET: el checkout funciona, pero la suscripción no se sincroniza\n" +
      "  hasta que configures el webhook a {API_URL}/api/integrations/stripe/webhook.",
  );
console.log("\nReinicia para aplicarlo:  pnpm arrancar");
console.log("Luego, en Configuración → Facturación podrás suscribirte.\n");
