# Cómo ver NV Core

Este paquete incluye **dos formas** de ver el proyecto.

---

## Opción A — Vista rápida con Live Server (sin instalar nada) ✅

Carpeta: **`static-preview/`** — es la app ya compilada a HTML/CSS/JS estático.

1. Abre en VS Code **la carpeta `static-preview/`** (File → Open Folder →
   `static-preview`). Es importante abrir *esa* carpeta como raíz, porque los
   assets usan rutas absolutas (`/_next/...`).
2. Clic derecho en `index.html` → **Open with Live Server**.
3. Se abrirá en el navegador y te redirigirá al dashboard del primer workspace.

> Notas de la vista estática:
> - Es una **exportación estática** para previsualizar el diseño y navegar por
>   las 16 pantallas de los 14 workspaces.
> - Verás **estados vacíos y skeletons** en todos lados: es intencional, no hay
>   datos falsos ni backend (esta es la Fase 1).
> - El `⌘K` (command palette), el workspace switcher, los drawers y el dark
>   theme funcionan.

---

## Opción B — Correr el proyecto real (recomendado para desarrollar)

Requisitos: **Node 20+** y **pnpm** (`npm i -g pnpm`).

```bash
pnpm install
pnpm dev
# abre http://localhost:3000
```

Esto levanta la app Next.js completa con hot-reload. Es la forma correcta de
seguir construyendo.

Otros comandos:

```bash
pnpm build       # build de producción (Node)
pnpm typecheck   # chequeo de tipos (TypeScript estricto)
pnpm lint        # linter
```

Para regenerar la vista estática de la Opción A:

```bash
cd apps/web
STATIC_EXPORT=true pnpm build   # genera apps/web/out
```

---

## Qué estás viendo

- **Monorepo** (pnpm + Turborepo): `apps/web` (Next.js), `apps/api` (placeholder
  NestJS), `packages/domain` (entidades, config, contratos de servicio),
  `packages/config-tailwind` (design tokens).
- 14 workspaces, 16 módulos del Core, shell fiel al diseño, todo en dark theme.
- Sin datos ficticios: la arquitectura queda lista para conectar backend e
  integraciones más adelante.

Ver `IMPLEMENTATION_PLAN.md` para el detalle completo de la arquitectura.
