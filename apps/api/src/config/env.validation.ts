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
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  // Allow public registration to claim Owner of an unclaimed built-in workspace.
  // Off by default (secure); "true"/"1" to enable open self-serve claiming.
  ALLOW_OPEN_WORKSPACE_CLAIM: z.string().optional(),
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
  GEMINI_MODEL: z.string().default("gemini-1.5-flash"),

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
  CLOUDINARY_URL: z.string().optional(),
  // Alternativa de hosting de imágenes (https://api.imgbb.com). Solo imágenes.
  IMGBB_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("NV Core <onboarding@resend.dev>"),
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
