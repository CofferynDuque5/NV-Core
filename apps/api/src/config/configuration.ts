import type { Env } from "./env.validation";

/**
 * Structured config derived from validated env. Injected via
 * `ConfigService<AppConfig, true>`.
 */
export interface AppConfig {
  env: Env["NODE_ENV"];
  port: number;
  corsOrigins: string[];
  auth: { secret: string; expiresIn: string; refreshTtlDays: number };
  database: { url?: string };
  redis: { url?: string };
  integrations: {
    n8n: { baseUrl?: string; apiKey?: string };
    ai: {
      provider?: "openai" | "anthropic" | "gemini";
      openai?: string;
      anthropic?: string;
      gemini?: string;
      models: { openai: string; anthropic: string; gemini: string };
    };
    whatsapp: { token?: string; phoneNumberId?: string };
    meta: { appId?: string; appSecret?: string };
    telegram: { botToken?: string };
    google: { clientId?: string; clientSecret?: string };
    stripe: { secretKey?: string; webhookSecret?: string };
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

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    corsOrigins: env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    auth: { secret, expiresIn: env.JWT_EXPIRES_IN, refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS },
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    integrations: {
      n8n: { baseUrl: env.N8N_BASE_URL, apiKey: env.N8N_API_KEY },
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
      },
      whatsapp: { token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID },
      meta: { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET },
      telegram: { botToken: env.TELEGRAM_BOT_TOKEN },
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
      stripe: { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET },
      cloudinary: { url: env.CLOUDINARY_URL },
      resend: { apiKey: env.RESEND_API_KEY },
    },
  };
}
