import type { Env } from "./env.validation";

/**
 * Structured config derived from validated env. Injected via
 * `ConfigService<AppConfig, true>`.
 */
export interface AppConfig {
  env: Env["NODE_ENV"];
  port: number;
  corsOrigins: string[];
  database: { url?: string };
  redis: { url?: string };
  integrations: {
    n8n: { baseUrl?: string; apiKey?: string };
    ai: { openai?: string; anthropic?: string; gemini?: string };
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
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    corsOrigins: env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    integrations: {
      n8n: { baseUrl: env.N8N_BASE_URL, apiKey: env.N8N_API_KEY },
      ai: {
        openai: env.OPENAI_API_KEY,
        anthropic: env.ANTHROPIC_API_KEY,
        gemini: env.GEMINI_API_KEY,
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
