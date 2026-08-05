# Cómo ver / correr NV Core

Monorepo completo: **frontend React + Vite (SPA) + backend NestJS + PostgreSQL/Prisma**,
con autenticación JWT, membresías por workspace y CRUD real. Incluye además una
**vista estática** para previsualizar sin instalar nada.

---

## Opción A — Vista rápida con Live Server (sin instalar nada) ✅

Carpeta: **`static-preview/`** — la app ya compilada a HTML/CSS/JS estático
(modo demo, sin backend: verás estados vacíos y skeletons por diseño).

1. Abre en VS Code **la carpeta `static-preview/`** como raíz (los assets usan
   rutas absolutas `/_next/...`).
2. Clic derecho en `index.html` → **Open with Live Server**.
3. Navega las 16 pantallas de los 14 workspaces, `⌘K`, switcher, drawers, dark
   theme.

---

## Opción B — Correr el proyecto real (frontend + backend + BD)

Requisitos: **Node 20+**, **pnpm** (`npm i -g pnpm`) y **PostgreSQL**.

```bash
pnpm install
```

### 1. Base de datos

Crea una BD y define la conexión en `apps/api/.env` (copia de `.env.example`):

```bash
# apps/api/.env
DATABASE_URL=postgresql://USER:PASS@localhost:5432/nvcore?schema=public
JWT_SECRET=pon-aqui-un-secreto-largo
CORS_ORIGINS=http://localhost:3000
```

Aplica el esquema:

```bash
pnpm --filter @nv/api prisma:generate
pnpm --filter @nv/api prisma:migrate     # aplica prisma/migrations
```

> Sin `DATABASE_URL` la API arranca igual y devuelve vacío (sin datos ficticios).

### 2. Backend (NestJS)

```bash
pnpm --filter @nv/api dev      # http://localhost:4000/api
```

- Salud: `GET /api/health` · **Swagger**: `http://localhost:4000/api/docs`

### 3. Frontend (React + Vite), apuntando al backend

```bash
echo "VITE_API_URL=http://localhost:4000" > apps/web/.env.local
pnpm --filter @nv/web dev      # http://localhost:3000
# Producción: pnpm --filter @nv/web build  → sirve apps/web/dist/ con Nginx
```

Sin `VITE_API_URL` la web corre en **modo demo** (estados vacíos, sin
login). Con la variable, te pedirá **iniciar sesión / registrarte**.

### Probar el flujo completo

1. Ve a `http://localhost:3000` → **Crear cuenta**; en "Workspace a reclamar"
   elige uno (te vuelves **Owner**).
2. Entra a **Contactos → Nuevo**, crea un contacto: aparece en la tabla y
   persiste en PostgreSQL. Igual en Campañas, Segmentos, Grupos, Plantillas.
3. Los permisos se aplican por rol (Owner/Admin/Editor/Visor) y cada escritura
   queda en **Auditoría** (Configuración → Logs).

### Otros comandos

```bash
pnpm build       # build de todo el monorepo (domain + web + api)
pnpm typecheck   # TypeScript estricto en todos los paquetes
pnpm --filter @nv/api prisma:studio        # inspeccionar la BD

# regenerar la vista estática (Opción A)
cd apps/web && STATIC_EXPORT=true pnpm build
```

---

## Estructura del monorepo

```
apps/
  web/     React 19 · Vite · react-router · Tailwind · shadcn/ui   (SPA)
  api/     NestJS 11 · Swagger · Prisma · PostgreSQL       (backend)
packages/
  domain/           @nv/domain — entidades, config, contratos de servicio
  config-tailwind/  design tokens
  tsconfig/         configs TS compartidas
```

## Qué está implementado

- **Auth JWT** + membresías por workspace + RBAC (Owner/Admin/Editor/Visor).
- **PostgreSQL + Prisma**: identidad y datos por workspace (multi-tenant por slug).
- **CRUD**: crear/editar/eliminar Contactos, Campañas, Segmentos, Grupos,
  Plantillas (+ Posts, Automatizaciones, Conexiones, Media) con validación y
  **auditoría** de cada escritura.
- **Frontend**: login/registro, shell fiel al diseño, y formularios "Nuevo"
  cableados a la API.

Detalle de arquitectura en `IMPLEMENTATION_PLAN.md` y `apps/api/README.md`.
