# @nv/api — Backend (NestJS)

Backend multi-workspace de NV Core. **Fase 2.** La API corre sobre
**PostgreSQL + Prisma**: identidad (usuarios/membresías) y todos los datos por
workspace se leen/escriben en la base real. Sin `DATABASE_URL`, la API sigue
arrancando y los endpoints devuelven vacío (sin datos ficticios). Las
integraciones externas (IA, mensajería, pagos…) aún no se invocan.

## Correr

```bash
cp .env.example .env          # opcional; sin DATABASE_URL la API sirve vacío
pnpm --filter @nv/api dev     # http://localhost:4000/api
```

- Salud: `GET /api/health`
- Swagger / OpenAPI: `http://localhost:4000/api/docs`

## Arquitectura

```
src/
├── main.ts                 # bootstrap, CORS, ValidationPipe, Swagger, filtro global
├── app.module.ts           # ConfigModule (validación zod) + todos los módulos
├── config/                 # env.validation.ts (zod) + configuration.ts (AppConfig)
├── common/
│   ├── tenant/             # WorkspaceGuard + @WorkspaceId() (multi-tenancy)
│   ├── dto/                # PaginationQueryDto, ListResultDto
│   └── filters/            # AllExceptionsFilter (JSON uniforme)
├── prisma/                 # PrismaService (lazy) + PrismaModule
├── health/
└── modules/                # un módulo por servicio de @nv/domain
    ├── workspaces/  contacts/  groups/  segments/
    ├── campaigns/  posts/  calendar/
    ├── inbox/  media/  templates/  automations/  analytics/
    ├── connections/  integrations/  notifications/  team/  audit/
    └── ai/  messaging/  billing/     # acciones → 501 hasta configurar proveedor
```

### Multi-tenant

Todas las rutas de datos viven bajo `GET /api/workspaces/:workspace/<recurso>`.
El `WorkspaceGuard` valida el tenant contra `@nv/domain` (WORKSPACES) antes de
cualquier handler. Cada método de servicio recibe `workspaceId` para aislar los
datos en cuanto exista la BD.

### Autenticación (JWT) + membresías de workspace

- `POST /api/auth/register` — crea usuario (hash scrypt). Con `workspaceSlug`
  opcional: si ese workspace aún no tiene miembros, el usuario se vuelve
  **Owner** (bootstrap). Devuelve `{ accessToken, user, memberships }`.
- `POST /api/auth/login` — devuelve token + membresías.
- `GET /api/auth/me` — usuario actual (requiere `Authorization: Bearer <jwt>`).
- `GET /api/workspaces/:workspace/members` — miembros del workspace.
- `POST /api/workspaces/:workspace/members` — invita a un usuario existente con
  un rol. Restringido a **Owner/Admin** (`RolesGuard`).

Guards: `JwtAuthGuard` es global (todo requiere token salvo rutas `@Public()`:
health, register, login, listado de workspaces). El `WorkspaceGuard` valida que
el usuario autenticado **pertenezca** al workspace (403 si no). `RolesGuard`
aplica RBAC por rol.

> El identity store (`AuthStore`) es **en memoria** y arranca **vacío** — sin
> usuarios sembrados. Es la base sin-BD para poder probar auth hoy; los modelos
> `User`/`Membership` ya existen en `schema.prisma` para migrarlo a Prisma sin
> cambiar el `AuthService`.

### Contrato compartido

Los tipos de request/response provienen de `@nv/domain`, el mismo paquete que
consume el frontend. Cuando implementes el adaptador HTTP en la web, las formas
coinciden 1:1.

## Base de datos (PostgreSQL + Prisma)

```bash
# 1. define DATABASE_URL en .env (copia de .env.example), p.ej.
#    postgresql://nvcore:nvcore@localhost:5432/nvcore?schema=public
# 2. genera el cliente y aplica migraciones
pnpm --filter @nv/api prisma:generate
pnpm --filter @nv/api prisma:migrate    # crea/aplica prisma/migrations
# 3. (opcional) inspecciona los datos
pnpm --filter @nv/api prisma:studio
```

- Modelo multi-tenant por **slug**: cada tabla lleva `workspaceSlug` indexado
  (los workspaces son configuración en `@nv/domain`, no filas de BD).
- `PrismaService` conecta al arrancar si hay `DATABASE_URL`; si no, `enabled` es
  `false` y los repositorios devuelven vacío en lugar de consultar.
- `AuthStore` y todos los *Service de lectura usan Prisma real (ver
  `src/prisma/mappers.ts` para el mapeo fila → entidad de dominio).
- Esquema completo en [`prisma/schema.prisma`](./prisma/schema.prisma);
  migraciones en [`prisma/migrations/`](./prisma/migrations/).

## Integraciones (diferidas)

Redis · n8n · OpenAI · Anthropic · Gemini · WhatsApp Business API · Meta Graph ·
Telegram · Google APIs · Stripe · Cloudinary · Resend. Sus variables ya están
declaradas y validadas en `.env.example` / `config/`; cada una es **opcional**,
así que la API arranca sin ninguna configurada.
