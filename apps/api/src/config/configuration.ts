import type { Env } from "./env.validation";

/**
 * Structured config derived from validated env. Injected via
 * `ConfigService<AppConfig, true>`.
 */
export interface AppConfig {
  env: Env["NODE_ENV"];
  port: number;
  corsOrigins: string[];
  appUrl: string;
  apiUrl: string;
  /** Workspace slug that receives inbound WhatsApp/Telegram messages. */
  inboundWorkspace?: string;
  auth: { secret: string; expiresIn: string; refreshTtlDays: number };
  security: { encryptionKey: string };
  sentry: { dsn?: string };
  database: { url?: string };
  redis: { url?: string };
  mail: { from: string };
  integrations: {
    n8n: { baseUrl?: string; apiKey?: string; eventsWebhook?: string; inboundSecret?: string };
    ai: {
      provider?: "openai" | "anthropic" | "gemini";
      openai?: string;
      anthropic?: string;
      gemini?: string;
      models: { openai: string; anthropic: string; gemini: string };
      monthlyQuota?: number;
    };
    whatsapp: { token?: string; phoneNumberId?: string; verifyToken?: string };
    meta: { appId?: string; appSecret?: string };
    telegram: { botToken?: string; webhookSecret?: string };
    whatsappSessionDir: string;
    google: { clientId?: string; clientSecret?: string };
    stripe: { secretKey?: string; webhookSecret?: string; priceId?: string };
    cloudinary: { url?: string };
    resend: { apiKey?: string };
  };
}

export function buildConfig(env: Env): AppConfig {
  // JWT secret is required in production; a stable dev fallback keeps the API
  // bootable locally without configuration.
  let secret = env.JWT_SECRET;
  if (!secret) {
    if (env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET es obligatorio en producción.");
    }
    secret = "nv-core-dev-secret-change-me";
  }

  // Encryption key for secrets at rest: required in production, dev fallback otherwise.
  let encryptionKey = env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    if (env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY es obligatorio en producción.");
    }
    encryptionKey = "nv-core-dev-encryption-key-change-me";
  }

  // Redis powers the job queue (BullMQ). Without it the queue runs inline, which
  // means scheduled publishing NEVER fires (a future-dated post can't run inline).
  // Requiring it in production turns a silent data-loss bug into a loud boot error.
  if (env.NODE_ENV === "production" && !env.REDIS_URL) {
    throw new Error(
      "REDIS_URL es obligatorio en producción: la publicación programada (posts/campañas) lo requiere.",
    );
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    corsOrigins: env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    appUrl: env.APP_URL.replace(/\/$/, ""),
    apiUrl: env.API_URL.replace(/\/$/, ""),
    inboundWorkspace: env.INBOUND_WORKSPACE,
    auth: { secret, expiresIn: env.JWT_EXPIRES_IN, refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS },
    security: { encryptionKey },
    sentry: { dsn: env.SENTRY_DSN },
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    mail: { from: env.MAIL_FROM },
    integrations: {
      n8n: {
        baseUrl: env.N8N_BASE_URL,
        apiKey: env.N8N_API_KEY,
        eventsWebhook: env.N8N_EVENTS_WEBHOOK,
        inboundSecret: env.N8N_INBOUND_SECRET,
      },
      ai: {
        provider: env.AI_PROVIDER,
        openai: env.OPENAI_API_KEY,
        anthropic: env.ANTHROPIC_API_KEY,
        gemini: env.GEMINI_API_KEY,
        models: {
          openai: env.OPENAI_MODEL,
          anthropic: env.ANTHROPIC_MODEL,
          gemini: env.GEMINI_MODEL,
        },
        monthlyQuota: env.AI_MONTHLY_QUOTA,
      },
      whatsapp: {
        token: env.WHATSAPP_TOKEN,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      },
      meta: { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET },
      telegram: { botToken: env.TELEGRAM_BOT_TOKEN, webhookSecret: env.TELEGRAM_WEBHOOK_SECRET },
      whatsappSessionDir: env.WHATSAPP_SESSION_DIR,
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
      stripe: {
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        priceId: env.STRIPE_PRICE_ID,
      },
      cloudinary: { url: env.CLOUDINARY_URL },
      resend: { apiKey: env.RESEND_API_KEY },
    },
  };
}
