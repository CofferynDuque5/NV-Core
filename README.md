# NV Core — Business Operating System

Plataforma **multi-workspace** de marketing, CRM y automatización omnicanal.
Monorepo profesional preparado para crecer a un SaaS comercial.

> **Fase 1 (esta entrega):** frontend completo con el shell y todas las
> pantallas del Core, en **estados vacíos / skeleton loaders** (sin datos
> ficticios). El backend y las integraciones quedan **preparados como
> contratos**, sin implementar. Ver [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

## Stack

pnpm workspaces · Turborepo · React 19 + **Vite** (SPA) · react-router ·
TypeScript estricto · TailwindCSS · shadcn/ui · Zustand · TanStack Query ·
Socket.IO · lucide-react. Backend: **NestJS + PostgreSQL/Prisma + Redis**.

## Estructura

```
apps/
  web/     Frontend React + Vite (SPA; build estático → dist/)
  api/     Backend NestJS
packages/
  domain/           @nv/domain — entidades, enums, config, contratos de servicio
  config-tailwind/  @nv/tailwind-preset — design tokens
  tsconfig/         configs TypeScript compartidas
```

## Primeros pasos

```bash
pnpm install
pnpm dev            # levanta apps/web en http://localhost:3000
pnpm build          # build de producción
pnpm typecheck      # chequeo de tipos (TS estricto)
```

La app redirige a `/w/<workspace>/dashboard`. Cambia de empresa con el
**workspace switcher** (sidebar) o el **command palette** (`⌘K`).

## Principios

- **Cero datos falsos.** Toda pantalla con datos arranca vacía, con skeletons
  y estados vacíos elegantes. Las métricas muestran `—` hasta que exista el
  backend.
- **Preparado, no implementado.** Postgres, Prisma, Redis, n8n, OpenAI,
  Anthropic, Gemini, WhatsApp Business API, Meta Graph, Telegram, Google,
  Stripe, Cloudinary y Resend están modelados como interfaces en
  `@nv/domain/services`. Activar el backend = implementar esos contratos y
  registrar un adaptador HTTP; **la UI no cambia**.
- **Multi-workspace.** 14 empresas comparten un Core de 16 módulos.

## Workspaces

Un Ciclo Creativo · Un Código Creativo · El Pulso de Naturaleza ·
Design Your Core · Perla Tour · VAROUDUVA STORE · Software Studio ·
Marketing Studio · AI Automation Studio · Fitness · Password Vault ·
Women's Health · NV Streaming · NV Stream.
