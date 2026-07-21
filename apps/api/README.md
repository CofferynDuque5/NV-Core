# @nv/api — Backend (NestJS) · PLACEHOLDER

> **Not implemented in phase 1.** This directory reserves the structure so the
> backend can be filled in later without reshaping the monorepo. There is no
> runnable server, database connection, or external API call here yet.

## Planned architecture (phase 2)

```
apps/api/
├── src/
│   ├── main.ts                 # Nest bootstrap
│   ├── app.module.ts
│   ├── common/                 # guards, interceptors, tenant middleware
│   ├── modules/                # one module per @nv/domain service
│   │   ├── auth/               # JWT, workspace membership
│   │   ├── workspaces/         # tenant resolution
│   │   ├── contacts/  groups/  segments/
│   │   ├── campaigns/ posts/   calendar/
│   │   ├── inbox/              # WhatsApp / Meta / Telegram webhooks
│   │   ├── media/             # Cloudinary
│   │   ├── templates/
│   │   ├── automations/       # n8n orchestration
│   │   ├── analytics/
│   │   ├── connections/       # OAuth (Meta Graph, Google)
│   │   ├── integrations/
│   │   ├── ai/                # OpenAI / Anthropic / Gemini
│   │   ├── messaging/         # WhatsApp Business API / Telegram
│   │   ├── email/             # Resend
│   │   ├── billing/           # Stripe
│   │   └── notifications/
│   └── prisma/                # schema.prisma (Postgres) + client
└── ...
```

## Integrations to wire (all deferred)

PostgreSQL · Prisma · Redis · n8n · OpenAI · Anthropic · Gemini ·
WhatsApp Business API · Meta Graph API · Telegram · Google APIs · Stripe ·
Cloudinary · Resend.

## Contract

The API must implement the `Services` interface from `@nv/domain/services`.
The frontend already consumes that contract through its service registry, so
enabling the backend is: implement modules → expose HTTP → register an HTTP
adapter in the web app. **No UI changes required.**
