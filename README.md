# NV Core — Business Operating System

Plataforma **multi-workspace** de marketing, CRM y automatización omnicanal.
Monorepo profesional, en modo **Release Candidate**: frontend y backend
implementados y funcionando end-to-end (auth, multi-tenancy, colas, billing,
IA, mensajería, media). Ver el estado real y lo pendiente en
[`docs/RELEASE-CANDIDATE-AUDIT.md`](./docs/RELEASE-CANDIDATE-AUDIT.md).

## Stack

pnpm workspaces · Turborepo · React 19 + **Vite** (SPA) · react-router ·
TypeScript estricto · TailwindCSS · shadcn/ui · Zustand · TanStack Query ·
Socket.IO · lucide-react. Backend: **NestJS 11 + PostgreSQL/Prisma + Redis
(BullMQ)**, JWT + refresh, RBAC por workspace, Stripe, proveedores de IA
(OpenAI/Anthropic/Gemini), WhatsApp/Telegram, Meta Graph, Google, Cloudinary,
Resend.

## Estructura

```
apps/
  web/     Frontend React + Vite (SPA; build estático → dist/)
  api/     Backend NestJS (25 módulos de feature, Prisma, colas)
packages/
  domain/           @nv/domain — entidades, enums, config, contratos de servicio
  config-tailwind/  @nv/tailwind-preset — design tokens
  tsconfig/         configs TypeScript compartidas
```

El frontend habla con el backend a través de un **registro de servicios**
intercambiable: sin `VITE_API_URL` corre en **modo demo** (adaptadores vacíos,
sin datos ficticios); con `VITE_API_URL` usa los adaptadores HTTP contra la API.

## Primeros pasos (desarrollo)

**Un solo comando levanta todo** — base de datos, backend y frontend — en
Windows, macOS o Linux:

```bash
pnpm install      # solo la primera vez, para tener pnpm y el script disponibles
pnpm arrancar
```

`pnpm arrancar` hace de un tirón: crea los `.env` que falten (con secretos
aleatorios; `apps/api/.env` y `apps/web/.env` están en `.gitignore`), **levanta
PostgreSQL en Docker** con puerto al host si no tienes uno, instala
dependencias, aplica migraciones y arranca **API (:4000) + Web (:3000)** con
recarga en caliente.

> Requisito: Docker Desktop en marcha (para que el script te levante Postgres),
> **o** un PostgreSQL propio — en ese caso pon tu `DATABASE_URL` en
> `apps/api/.env` y usa `pnpm arrancar --no-db`.

Equivalentes por sistema (todos llaman al mismo script):

```text
Windows:  pnpm arrancar   ·  .\arrancar.cmd   ·  .\arrancar.ps1
Mac/Linux: pnpm arrancar  ·  ./arrancar.sh
```

Variantes: `pnpm arrancar --prepare-only` (prepara sin levantar),
`--skip-install`, `--no-db`, `--help`.

O paso a paso:

```bash
pnpm install
pnpm dev            # web en :3000, api en :4000 (necesita Postgres; Redis opcional)
pnpm build          # build de producción (todos los workspaces)
pnpm typecheck      # chequeo de tipos (TS estricto)
pnpm test           # unit tests (API + web + dominio)
```

La API necesita `DATABASE_URL`, `JWT_SECRET` y `ENCRYPTION_KEY` (ver
`apps/api/.env.example`). Aplica migraciones con
`pnpm --filter @nv/api exec prisma migrate deploy`. Para que la web hable con la
API, define `VITE_API_URL=http://localhost:4000` en `apps/web/.env` (sin él,
arranca en modo demo con pantallas vacías).

## Todo en Docker (una orden)

```bash
cp .env.docker.example .env     # define JWT_SECRET y ENCRYPTION_KEY
docker compose up --build       # web en :3000, api en :4000/api
```

Los secretos **no traen valores por defecto**: defínelos en `.env`. El admin
inicial es opcional (`NV_ADMIN_EMAIL` + `NV_ADMIN_PASSWORD`). Backups y runbook
de operación: [`docs/OPERATIONS.md`](./docs/OPERATIONS.md).

## Principios

- **Cero datos falsos.** En modo demo las pantallas arrancan vacías con
  skeletons; las métricas muestran `—` hasta que hay backend.
- **Contratos primero.** Cada servicio de `@nv/domain/services` tiene su
  adaptador HTTP (web) y su módulo NestJS (api); añadir un proveedor = registrar
  un adaptador, sin tocar la UI.
- **Multi-workspace.** Varias empresas comparten un Core de módulos con RBAC y
  aislamiento por tenant.

## Documentación

- [`docs/RELEASE-CANDIDATE-AUDIT.md`](./docs/RELEASE-CANDIDATE-AUDIT.md) — estado RC y backlog.
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) — deploy, backups/restore, rollback, health checks.
- [`SETUP.md`](./SETUP.md) — puesta en marcha detallada.
- API reference: Swagger en `/api/docs` con la API levantada.
