# Cómo ver / correr NV Core

Este paquete incluye el **monorepo completo** (frontend Next.js + backend
NestJS) y una **vista estática** para previsualizar sin instalar nada.

---

## Opción A — Vista rápida con Live Server (sin instalar nada) ✅

Carpeta: **`static-preview/`** — la app ya compilada a HTML/CSS/JS estático.

1. Abre en VS Code **la carpeta `static-preview/`** (File → Open Folder →
   `static-preview`). Ábrela *como raíz*, porque los assets usan rutas
   absolutas (`/_next/...`).
2. Clic derecho en `index.html` → **Open with Live Server**.
3. Navega las 16 pantallas de los 14 workspaces, prueba `⌘K`, el switcher de
   workspace, los drawers y el dark theme.

> Verás **estados vacíos y skeletons** en todos lados: es intencional. No hay
> datos falsos. La lógica con datos vive en la app real (Opción B).

---

## Opción B — Correr el proyecto real (frontend + backend)

Requisitos: **Node 20+** y **pnpm** (`npm i -g pnpm`).

```bash
pnpm install
```

### Frontend (Next.js)

```bash
pnpm --filter @nv/web dev      # http://localhost:3000
```

### Backend (NestJS)

```bash
pnpm --filter @nv/api dev      # http://localhost:4000/api
```

- Salud: `GET http://localhost:4000/api/health`
- **Swagger / OpenAPI**: `http://localhost:4000/api/docs`

La API arranca **sin base de datos** y devuelve resultados vacíos (sin datos
ficticios). Los proveedores externos responden `501` hasta configurarse.

### Conectar el frontend al backend (opcional)

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > apps/web/.env.local
# reinicia `pnpm --filter @nv/web dev`
```

Sin esa variable, la web usa adaptadores vacíos (mismos estados vacíos). Con
ella, cada hook de datos consume el backend real. **Cero cambios de código.**

### Otros comandos

```bash
pnpm build       # build de todo el monorepo (domain + web + api)
pnpm typecheck   # TypeScript estricto en todos los paquetes
pnpm lint

# regenerar la vista estática de la Opción A
cd apps/web && STATIC_EXPORT=true pnpm build   # genera apps/web/out
```

---

## Estructura del monorepo

```
apps/
  web/     Next.js 15 · React 19 · Tailwind · shadcn/ui   (frontend)
  api/     NestJS 11 · Swagger · Prisma (schema listo)    (backend)
packages/
  domain/           @nv/domain — entidades, config, contratos de servicio
  config-tailwind/  design tokens
  tsconfig/         configs TS compartidas
```

## Conectar PostgreSQL (siguiente paso del backend)

```bash
# 1. define DATABASE_URL en apps/api/.env (copia de apps/api/.env.example)
# 2. genera el cliente y migra
pnpm --filter @nv/api prisma:generate
pnpm --filter @nv/api prisma:migrate
# 3. implementa las consultas Prisma dentro de cada *Service (hoy retornan vacío)
```

El modelo de datos completo (multi-tenant, `workspaceId` en cada tabla) está en
`apps/api/prisma/schema.prisma`.

Ver `IMPLEMENTATION_PLAN.md` para el detalle de arquitectura y
`apps/api/README.md` para el backend.
