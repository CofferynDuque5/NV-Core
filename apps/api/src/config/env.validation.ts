import { z } from "zod";

/**
 * Environment schema. Only core vars are required; every integration is
 * optional so the API boots and serves empty data with zero external
 * dependencies configured.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  // Public base URLs (used to build OAuth redirect URIs and post-callback redirects).
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000"),

  // Auth. Key entropy == secret entropy (derived via SHA-256/JWT), so require
  // at least 32 chars in every environment.
  JWT_SECRET: z.string().min(32).optional(),
  // Symmetric key for encrypting secrets at rest (OAuth tokens, etc.).
  ENCRYPTION_KEY: z.string().min(32).optional(),
  // Access token lifetime (short). Refresh tokens extend the session.
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Allow public registration to claim Owner of an unclaimed built-in workspace.
  // Off by default (secure); "true"/"1" to enable open self-serve claiming.
  ALLOW_OPEN_WORKSPACE_CLAIM: z.string().optional(),
  /** "false" turns off the public read-only demo («Ver demo»). */
  DEMO_ENABLED: z.string().optional(),
  // Bootstrap admin (también super-admin de la plataforma).
  NV_ADMIN_EMAIL: z.string().optional(),
  // Super-admins de la plataforma (emails separados por coma): controlan a
  // todos los usuarios y sus roles en cualquier workspace.
  NV_SUPER_ADMINS: z.string().optional(),
  // Optional bearer token guarding GET /api/metrics (Prometheus scrape).
  METRICS_TOKEN: z.string().optional(),

  // Data / infra
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),

  // Observability
  SENTRY_DSN: z.string().url().optional(),
  // Log format: "json" (structured, for aggregators) or "pretty" (dev console).
  // Defaults to json in production, pretty otherwise (resolved in main.ts).
  LOG_FORMAT: z.enum(["json", "pretty"]).optional(),

  // Automation — n8n as the orchestrator
  N8N_BASE_URL: z.string().url().optional(),
  N8N_API_KEY: z.string().optional(),
  // Domain events forwarded to n8n so workflows can orchestrate (URL or path).
  N8N_EVENTS_WEBHOOK: z.string().optional(),
  // Shared secret n8n must send (X-N8N-Secret) to call backend action endpoints.
  N8N_INBOUND_SECRET: z.string().optional(),

  // AI providers
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  // Optional overrides — pick a provider explicitly and/or override models.
  AI_PROVIDER: z.enum(["openai", "anthropic", "gemini"]).optional(),
  // Optional monthly cap on AI calls per workspace (0/unset = unlimited).
  AI_MONTHLY_QUOTA: z.coerce.number().int().nonnegative().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  GEMINI_MODEL: z.string().default("auto"),

  // Messaging
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  // Telegram MTProto (cuenta de usuario, login por QR). API_ID/API_HASH se
  // obtienen gratis en https://my.telegram.org (necesarios para GramJS).
  TELEGRAM_API_ID: z.string().optional(),
  TELEGRAM_API_HASH: z.string().optional(),
  // Directory where GramJS stores the Telegram user session (per workspace).
  TELEGRAM_SESSION_DIR: z.string().default("data/telegram"),
  // Directory where Baileys stores WhatsApp session credentials (per workspace).
  WHATSAPP_SESSION_DIR: z.string().default("data/whatsapp"),

  // Archivos subidos (imágenes, video, documentos) guardados en este servidor.
  // "off" desactiva la subida al servidor (quedan ImgBB/Cloudinary si existen).
  MEDIA_STORAGE: z.enum(["local", "off"]).default("local"),
  // Carpeta donde se guardan; debe sobrevivir a cada despliegue.
  MEDIA_DIR: z.string().default("data/uploads"),
  // Tamaño máximo por archivo, en MB.
  MEDIA_MAX_MB: z.coerce.number().int().positive().max(2048).default(100),
  // URL pública con la que se sirven (por defecto API_URL). Debe ser https en
  // producción para que WhatsApp, Instagram y Facebook puedan descargarlos.
  MEDIA_PUBLIC_URL: z.string().url().optional(),
  // Workspace that receives inbound messages (WhatsApp/Telegram webhooks).
  INBOUND_WORKSPACE: z.string().optional(),

  // Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Payments / media / email
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Default subscription price used at checkout when the client sends none.
  STRIPE_PRICE_ID: z.string().optional(),
  /** Plan used when Stripe isn't configured (self-host / dev). Default "pro". */
  DEFAULT_PLAN: z.enum(["free", "pro"]).optional(),
  /** Free trial of a customer-created brand, in hours (0 = no trial, never locked). */
  TRIAL_HOURS: z.coerce.number().int().min(0).max(24 * 90).optional(),
  // Manual plan payment after the trial: the operator's own brand whose
  // Cobros methods customers pay to, and the price of each paid period.
  NV_BILLING_WORKSPACE: z.string().optional(),
  // Pro (PLAN_PRICE, default 19) and Básico (PLAN_BASIC_PRICE, default 7).
  PLAN_PRICE: z.coerce.number().positive().max(1_000_000).optional(),
  PLAN_BASIC_PRICE: z.coerce.number().positive().max(1_000_000).optional(),
  PLAN_CURRENCY: z.enum(["COP", "VES", "PEN", "USD", "USDT"]).optional(),
  PLAN_DAYS: z.coerce.number().int().min(1).max(400).optional(),
  // Una prueba gratis por dispositivo: además del id del navegador, se compara
  // la huella del navegador + IP de la última semana. false = solo id y cuenta.
  TRIAL_FINGERPRINT_CHECK: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Comprobantes de pago de planes: carpeta PRIVADA (nunca se sirve en público).
  RECEIPTS_DIR: z.string().default("data/receipts"),
  // Tasa USDT→bolívares para los métodos en VES. Vacía = la del día (mediana de
  // ofertas de Binance P2P, se refresca cada 30 min). Con un número, se usa ese.
  USDT_VES_RATE: z.coerce.number().positive().max(100_000_000).optional(),
  // false = no consultar Binance (solo USDT_VES_RATE, o sin tasa).
  USDT_RATE_AUTO: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // WhatsApp del operador (solo números, con código de país) al que llega cada
  // pago de plan, enviado desde el WhatsApp conectado en NV_BILLING_WORKSPACE.
  NV_ADMIN_WHATSAPP: z.string().regex(/^\+?\d{8,15}$/, "NV_ADMIN_WHATSAPP: solo dígitos con código de país").optional(),
  CLOUDINARY_URL: z.string().optional(),
  // Alternativa de hosting de imágenes (https://api.imgbb.com). Solo imágenes.
  IMGBB_API_KEY: z.string().optional(),
  // Correo saliente (verificación, recuperar contraseña, invitaciones).
  // Gratis: el buzón de tu propio cPanel por SMTP (SMTP_HOST=mail.tudominio.com,
  // SMTP_USER=el correo, SMTP_PASS=su contraseña). Si no hay SMTP se usa Resend
  // (RESEND_API_KEY); sin ninguno, no se envía nada.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // Remitente. Sin MAIL_FROM: «NV Marketing <SMTP_USER>» o el de pruebas de Resend.
  MAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
