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
  auth: {
    secret: string;
    expiresIn: string;
    refreshTtlDays: number;
    /**
     * When true, a public registration may claim Owner of a built-in workspace
     * that has no members yet. Off by default (secure): provisioning is via
     * NV_ADMIN_* or invitation, so an attacker can't land-grab an unclaimed tenant.
     */
    allowOpenWorkspaceClaim: boolean;
  };
  security: { encryptionKey: string };
  /** Emails that are platform super-admins (control all users/roles). */
  superAdmins: string[];
  /** «Ver demo»: a shared read-only account with an example brand. */
  demo: { enabled: boolean; email: string; slug: string };
  /** Optional bearer token protecting the Prometheus /metrics endpoint. */
  metricsToken?: string;
  sentry: { dsn?: string };
  database: { url?: string };
  redis: { url?: string };
  mail: { from: string };
  /** Files uploaded to this server (see modules/media/local-storage.ts). */
  media: { enabled: boolean; dir: string; maxBytes: number; publicBase: string };
  /** Plan applied when Stripe isn't configured (self-host / dev). */
  billing: {
    defaultPlan: "free" | "pro";
    trialHours: number;
    /** Operator brand whose Cobros receive plan payments ("" = not set). */
    operatorWorkspace: string;
    /** Pro: price of each paid period. */
    plan: { price: number; currency: "COP" | "VES" | "PEN" | "USD" | "USDT"; days: number };
    /** Price of Básico (same currency and days as Pro). */
    basicPrice: number;
  };
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
    telegram: { botToken?: string; webhookSecret?: string; apiId?: number; apiHash?: string };
    whatsappSessionDir: string;
    telegramSessionDir: string;
    google: { clientId?: string; clientSecret?: string };
    stripe: { secretKey?: string; webhookSecret?: string; priceId?: string };
    cloudinary: { url?: string };
    imgbb: { apiKey?: string };
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

  // Redis powers the distributed job queue (BullMQ) with retries. It's optional:
  // without it, jobs run in-process and the campaign runner still fires on its own
  // 30s tick (scheduled campaigns work). Redis only adds distribution + retries,
  // so we warn instead of crashing — this lets NV Marketing run on any host with just
  // PostgreSQL (Render, a VPS, a cPanel Node app, etc.).
  if (env.NODE_ENV === "production" && !env.REDIS_URL) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] REDIS_URL no definido: la cola corre en modo inline (sin Redis). " +
        "Las campañas programadas sí funcionan; solo se pierden reintentos distribuidos.",
    );
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    corsOrigins: env.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    appUrl: env.APP_URL.replace(/\/$/, ""),
    apiUrl: env.API_URL.replace(/\/$/, ""),
    inboundWorkspace: env.INBOUND_WORKSPACE,
    auth: {
      secret,
      expiresIn: env.JWT_EXPIRES_IN,
      refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      allowOpenWorkspaceClaim:
        env.ALLOW_OPEN_WORKSPACE_CLAIM === "true" || env.ALLOW_OPEN_WORKSPACE_CLAIM === "1",
    },
    security: { encryptionKey },
    superAdmins: Array.from(
      new Set(
        [...(env.NV_SUPER_ADMINS?.split(",") ?? []), env.NV_ADMIN_EMAIL ?? ""]
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      ),
    ),
    demo: {
      // On unless DEMO_ENABLED=false: the demo account can't change anything.
      enabled: !["false", "0", "no"].includes((env.DEMO_ENABLED ?? "").trim().toLowerCase()),
      email: "demo@demo.nvmarketing.invalid",
      slug: "nv-demo",
    },
    metricsToken: env.METRICS_TOKEN,
    sentry: { dsn: env.SENTRY_DSN },
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    mail: { from: env.MAIL_FROM },
    media: {
      enabled: env.MEDIA_STORAGE === "local",
      dir: env.MEDIA_DIR,
      maxBytes: env.MEDIA_MAX_MB * 1024 * 1024,
      publicBase: (env.MEDIA_PUBLIC_URL ?? env.API_URL).replace(/\/$/, ""),
    },
    billing: {
      defaultPlan: env.DEFAULT_PLAN === "free" ? "free" : "pro",
      trialHours: env.TRIAL_HOURS ?? 24,
      operatorWorkspace: env.NV_BILLING_WORKSPACE?.trim().toLowerCase() ?? "",
      plan: { price: env.PLAN_PRICE ?? 19, currency: env.PLAN_CURRENCY ?? "USD", days: env.PLAN_DAYS ?? 30 },
      basicPrice: env.PLAN_BASIC_PRICE ?? 7,
    },
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
      telegram: {
        botToken: env.TELEGRAM_BOT_TOKEN,
        webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
        apiId: env.TELEGRAM_API_ID ? Number(env.TELEGRAM_API_ID) : undefined,
        apiHash: env.TELEGRAM_API_HASH,
      },
      whatsappSessionDir: env.WHATSAPP_SESSION_DIR,
      telegramSessionDir: env.TELEGRAM_SESSION_DIR,
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
      stripe: {
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        priceId: env.STRIPE_PRICE_ID,
      },
      cloudinary: { url: env.CLOUDINARY_URL },
      imgbb: { apiKey: env.IMGBB_API_KEY },
      resend: { apiKey: env.RESEND_API_KEY },
    },
  };
}
