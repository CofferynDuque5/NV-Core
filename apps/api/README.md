# @nv/api — Backend (NestJS)

Backend multi-workspace de NV Core. **Fase 2 en curso.** La estructura y el
cableado están listos y la API **corre**; los endpoints devuelven **resultados
vacíos** (sin datos ficticios) hasta conectar PostgreSQL. Ninguna integración
externa se invoca todavía.

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

## Conectar la base de datos (siguiente paso)

```bash
# 1. define DATABASE_URL en .env (PostgreSQL)
# 2. genera el cliente y migra
pnpm --filter @nv/api prisma:generate
pnpm --filter @nv/api prisma:migrate
# 3. implementa las consultas Prisma dentro de cada *Service (hoy retornan vacío)
```

El modelo de datos completo (multi-tenant, con `workspaceId` en cada tabla) está
en [`prisma/schema.prisma`](./prisma/schema.prisma).

## Integraciones (diferidas)

Redis · n8n · OpenAI · Anthropic · Gemini · WhatsApp Business API · Meta Graph ·
Telegram · Google APIs · Stripe · Cloudinary · Resend. Sus variables ya están
declaradas y validadas en `.env.example` / `config/`; cada una es **opcional**,
así que la API arranca sin ninguna configurada.
