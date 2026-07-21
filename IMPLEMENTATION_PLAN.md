# NV Core — Plan de Implementación

> **Business Operating System multi-workspace.**
> Documento de arquitectura y planificación. Redactado **antes** de escribir código, tal y como exige el brief.
> Estado: fundación profesional lista para crecer a SaaS comercial. **Sin backend, sin APIs, sin base de datos** todavía — solo la estructura preparada.

---

## 0. Principios rectores

1. **Cero datos falsos.** Ninguna campaña, usuario, producto o estadística está hardcodeada en la aplicación. El diseño original (`NV_Core.html`) incluía datos de demostración (NV Streaming, contactos, etc.); esos datos se usan **únicamente** como referencia para modelar entidades y tipos, **nunca** se copian al producto. Toda pantalla con datos arranca en **estado vacío** con skeleton loaders, placeholders y mensajes elegantes.
2. **Fidelidad visual exacta.** Se reproduce el shell (sidebar, topbar, workspace switcher, command palette, drawers, dark theme, tipografía Inter + Newsreader y la paleta exacta) tal cual el diseño. Lo que cambia es el **contenido dinámico**, que en vez de datos ficticios muestra estados vacíos.
3. **Preparado, no implementado.** Backend (NestJS), Postgres, Prisma, Redis, n8n, OpenAI, Anthropic, Gemini, WhatsApp Business API, Meta Graph API, Telegram, Google APIs, Stripe, Cloudinary y Resend quedan **modelados como contratos/interfaces y placeholders**, sin ninguna llamada real.
4. **Escalabilidad primero.** Monorepo, capa de dominio compartida, servicios detrás de interfaces, estado global desacoplado, componentes y hooks reutilizables, TypeScript estricto.
5. **Multi-workspace.** Un **Core** común + módulos específicos por empresa. El workspace activo condiciona branding, módulos habilitados y (en el futuro) el aislamiento de datos (tenant).

---

## 1. Análisis del diseño (`NV_Core.html`)

El diseño entregado es una SPA de un **"Business OS"** de marketing/CRM omnicanal. Se analizó su marcado declarativo completo y sus estructuras de datos internas. Resumen:

### 1.1. Identidad visual / design tokens

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0B0D10` | Fondo base de la app |
| `--bg-nav` | `#0E1114` | Sidebar |
| `--surface` | `#101318` / `#12151A` / `#14181E` | Paneles, cards |
| `--surface-2` | `#14171C` / `#161A20` | Cards anidadas, inputs |
| `--border` | `#1C2229` / `#1F252C` | Bordes sutiles |
| `--border-strong` | `#262C34` / `#333B45` | Bordes hover / activos |
| `--text` | `#E6E9EE` | Texto principal |
| `--text-bright` | `#F3F5F8` | Títulos |
| `--text-muted` | `#8A93A0` / `#9BA3AE` / `#6B7280` | Texto secundario / meta |
| `--primary` | `#5B8DEF` | Azul de marca (acción principal) |
| `--primary-2` | `#7C7CF0` / `#6E6EF2` | Púrpura (gradientes, IA) |
| `--success` | `#3FB950` | Estados OK |
| `--warning` | `#E3B341` | Advertencias |
| `--danger` | `#F85149` | Errores |
| Gradiente marca | `linear-gradient(140deg,#5B8DEF,#7C7CF0)` | Logo, CTAs, avatares |
| Fuente cuerpo | `Inter` | Todo el UI |
| Fuente display | `Newsreader` (serif) | Wordmark "NV Core", títulos hero |

Radios: 7–14px. Sombra de marca: `0 3px 10px -3px rgba(91,141,239,.7)`. Animaciones: `fadein`, `slideInRight`, `popIn`, `toastIn`, `riseIn`, `pulseDot`, `spin`.

**Colores de canal (providers):**

| Canal | Color | Canal | Color |
|---|---|---|---|
| WhatsApp | `#25D366` | Telegram | `#229ED9` |
| Instagram | `#E1306C` | X | `#C9CDD3` |
| Facebook | `#1877F2` | Threads | `#E6E9EE` |
| TikTok | `#FE2C55` | Email | `#8B5CF6` |

### 1.2. Estructura de navegación (sidebar)

El sidebar es **colapsable** (expandido ~248px / colapsado ~64px) y agrupa los módulos del Core en 6 secciones:

| Sección | Módulos |
|---|---|
| **PRINCIPAL** | Dashboard · Calendario · Campañas |
| **AUDIENCIA** | Contactos · Grupos · Segmentos |
| **MENSAJERÍA** | Inbox |
| **CREACIÓN** | Campaign Builder · AI Content Studio · Plantillas · Biblioteca |
| **AUTOMATIZACIÓN** | Automatizaciones · Analytics |
| **SISTEMA** | Conexiones · Configuración |

Encabezado del sidebar: botón-logo (gradiente) + wordmark "NV Core / BUSINESS OS" + selector de workspace. Pie: perfil de usuario.

### 1.3. Inventario de pantallas (18 vistas)

1. **Dashboard** — saludo, 4 stat tiles (Campañas activas, Publicaciones hoy, Alcance semanal, Errores activos), agenda de publicaciones de hoy, campañas activas, alertas del sistema, accesos rápidos.
2. **Calendario** — 5 sub-vistas: **Mes**, **Semana**, **Día**, **Agenda**, **Kanban**. Panel lateral de "Recomendaciones IA" (mejores horarios, conflictos), leyenda por canal.
3. **Campañas** — grid de campañas con estado (activa/programada/pausada/borrador), alcance, posts, CTR, progreso, próxima publicación, canales. Abre **Campaign Drawer**.
4. **Contactos (CRM)** — tabla (nombre, teléfono, empresa, etiquetas, estado, último contacto). Acciones: nuevo contacto, mensaje masivo, importar, exportar, filtrar.
5. **Grupos** — grid de grupos de WhatsApp (miembros, admins, etiquetas). Abre **Group Drawer** (mensajes, archivos, programaciones, automatizaciones, encuestas, recordatorios).
6. **Segmentos** — audiencias dinámicas con reglas, conteo. Acciones: crear campaña, editar filtros.
7. **Inbox** — bandeja unificada omnicanal (lista de conversaciones + hilo + composer). Asignar, resolver, responder.
8. **Campaign Builder** — lienzo visual (canvas) con objetos arrastrables (título, subtítulo, precio, imagen, botón/CTA, sticker, cuenta regresiva) + panel de propiedades (contenido, estilo, fuente, color, tamaño, sombra, variable dinámica) + vista previa. Guardar borrador / programar.
9. **AI Content Studio** — prompt de contenido, selector de plataforma y tono, generación de variantes (A/B), traducción, hashtags recomendados.
10. **Plantillas** — biblioteca de mensajes reutilizables por categoría (usos, editar, usar).
11. **Biblioteca (Media Manager)** — carpetas + grid/lista de medios (imágenes, videos), subir.
12. **Automatizaciones** — lista de flujos (no-code) con nodos: trigger, action, wait, cond. Ejecuciones, activar/pausar, probar. Editor de flujo.
13. **Analytics** — 6 KPIs, embudo de conversión, alcance por plataforma, mapa de calor (día×hora), mejores campañas.
14. **Marketplace** — catálogo de integraciones por categoría (conectar/desconectar).
15. **Conexiones** — proveedores & OAuth (estado ok/warn/down), registro OAuth & webhooks, estado del scheduler. Abre **Connection Drawer** (credenciales, token, expiración, webhook, permisos, logs, reconectar, eliminar).
16. **Configuración** — equipo (invitar), roles y permisos (matriz), auditoría & logs.
17. **Workspace Special View** — vista específica por workspace (KPIs, columnas y filas propias del vertical de cada empresa; ver §4).
18. **Notificaciones** — panel/registro (marcar leídas, ver todo).

### 1.4. Overlays (modales / drawers / paneles)

- **Command Palette** (⌘K) — buscador de acciones/navegación con resultados vacíos elegantes.
- **Workspace Switcher** — modal "Elige tu workspace", tarjeta por empresa (módulos + Core, entrar).
- **Notifications Panel** — deslizable desde topbar.
- **Compose / Mensaje masivo** — wizard de 5 pasos: Audiencia → Contenido → Adjuntar → Programación → Revisar y enviar.
- **Campaign Drawer** — detalle de campaña.
- **Group Drawer** — detalle de grupo con pestañas.
- **Post Drawer** — detalle de publicación (copy, plataformas, programado, métricas, historial, publicar/duplicar/editar/eliminar).
- **Connection Drawer** — configuración de proveedor.
- **Profile Menu** — menú de usuario.
- **Toasts** — notificaciones efímeras.

### 1.5. Formularios detectados

- Búsqueda global / command input.
- Nuevo/editar contacto.
- Nuevo/editar segmento (constructor de reglas).
- Nueva/editar plantilla.
- Compose wizard (audiencia, contenido con variables `{nombre}`/`{servicio}`/`{fecha}`, adjuntos, programación).
- Campaign Builder (propiedades del objeto seleccionado).
- AI Studio (prompt, plataforma, tono).
- Credenciales de API por proveedor (token, webhook, permisos, probar/guardar).
- Invitar usuario / editar rol / matriz de permisos.
- Configuración (workspace, cuenta, notificaciones, facturación).

---

## 2. Stack tecnológico

| Capa | Tecnología | Estado |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | ✅ implementado |
| Frontend | **Next.js 15 (App Router) · React 19** | ✅ implementado |
| Lenguaje | **TypeScript estricto** (`strict`, `noUncheckedIndexedAccess`, etc.) | ✅ |
| Estilos | **TailwindCSS v3** con preset de design tokens | ✅ |
| UI kit | **shadcn/ui** (Radix + CVA) | ✅ base + componentes clave |
| Estado global | **Zustand** (stores por dominio) | ✅ |
| Data fetching | **TanStack Query** (provider preparado, sin llamadas) | ✅ preparado |
| Formularios | **react-hook-form + zod** | ✅ preparado |
| Iconos | **lucide-react** | ✅ |
| Backend | **NestJS** | 🟡 solo estructura/placeholder |
| ORM / DB | **Prisma + PostgreSQL** | 🟡 preparado (schema futuro) |
| Cache/colas | **Redis** | 🟡 contrato |
| Automatización | **n8n** | 🟡 contrato |
| IA | **OpenAI · Anthropic · Gemini** | 🟡 interfaces |
| Mensajería | **WhatsApp Business · Meta Graph · Telegram** | 🟡 interfaces |
| Google | **Google APIs** | 🟡 interfaces |
| Pagos | **Stripe** | 🟡 interfaz |
| Media | **Cloudinary** | 🟡 interfaz |
| Email | **Resend** | 🟡 interfaz |

> 🟡 = **contrato/interfaz/estructura únicamente**. No hay implementación, credenciales ni llamadas de red.

---

## 3. Estructura del monorepo

```
NV-Core/
├── package.json                 # raíz (workspaces + scripts turbo)
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .npmrc / .gitignore / .editorconfig / .prettierrc
├── IMPLEMENTATION_PLAN.md        # este documento
├── README.md
│
├── apps/
│   ├── web/                      # Frontend Next.js (App Router)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx            # root, fuentes, providers
│   │   │   │   ├── globals.css           # tokens + Tailwind
│   │   │   │   ├── page.tsx              # redirect → workspace por defecto
│   │   │   │   └── w/[workspace]/        # shell multi-workspace
│   │   │   │       ├── layout.tsx        # sidebar + topbar + overlays
│   │   │   │       ├── dashboard/…
│   │   │   │       ├── calendario/…
│   │   │   │       ├── campanas/…
│   │   │   │       ├── contactos/…
│   │   │   │       ├── grupos/…
│   │   │   │       ├── segmentos/…
│   │   │   │       ├── inbox/…
│   │   │   │       ├── builder/…
│   │   │   │       ├── ai/…
│   │   │   │       ├── plantillas/…
│   │   │   │       ├── biblioteca/…
│   │   │   │       ├── automatizaciones/…
│   │   │   │       ├── analytics/…
│   │   │   │       ├── marketplace/…
│   │   │   │       ├── conexiones/…
│   │   │   │       └── configuracion/…
│   │   │   ├── components/
│   │   │   │   ├── ui/            # shadcn primitives
│   │   │   │   ├── shell/         # sidebar, topbar, switcher, command palette, notifications
│   │   │   │   ├── common/        # empty-state, skeletons, page-header, kpi-card, channel-badge…
│   │   │   │   └── overlays/      # drawers, compose wizard, modales
│   │   │   ├── hooks/             # hooks reutilizables
│   │   │   ├── stores/           # zustand (workspace, ui, command)
│   │   │   ├── providers/         # QueryProvider, ThemeProvider
│   │   │   ├── lib/               # utils (cn, formatters)
│   │   │   └── config/            # nav, workspaces, providers, feature flags (UI)
│   │   ├── next.config.mjs · tailwind.config.ts · components.json · tsconfig.json
│   │
│   └── api/                       # 🟡 NestJS (placeholder, sin implementar)
│       ├── src/main.ts (stub) · app.module.ts (stub)
│       └── README.md (roadmap backend)
│
└── packages/
    ├── domain/                   # @nv/domain — capa compartida web ↔ api
    │   ├── entities/             # tipos de dominio (Contact, Campaign, …)
    │   ├── enums/                # ChannelId, CampaignStatus, Role, …
    │   ├── dto/                  # contratos de request/response
    │   ├── services/             # INTERFACES de servicios (sin implementación)
    │   └── config/               # workspaces, providers, nav (fuente de verdad)
    ├── config-tailwind/          # @nv/tailwind-preset — tokens de diseño
    └── tsconfig/                 # configs TS compartidas
```

---

## 4. Workspaces (multi-tenant)

Un **Core** común compartido + módulos verticales por empresa. Cada workspace define: `id`, `name`, `kind`, `accent`, `initials`, módulos habilitados y (futuro) su *Special View*.

| # | Workspace | Vertical (kind) |
|---|---|---|
| 1 | Un Ciclo Creativo | Agencia / creativo |
| 2 | Un Código Creativo | Software / creativo |
| 3 | El Pulso de Naturaleza | Salud / bienestar |
| 4 | Design Your Core | Diseño / branding |
| 5 | Perla Tour | Turismo |
| 6 | VAROUDUVA STORE | E-commerce |
| 7 | Software Studio | Software |
| 8 | Marketing Studio | Marketing |
| 9 | AI Automation Studio | Automatización IA |
| 10 | Fitness | Fitness |
| 11 | Password Vault | Seguridad / bóveda |
| 12 | Women's Health | Salud femenina |
| 13 | NV Streaming | Streaming / suscripciones |
| 14 | NV Stream | Medios / contenido |

**Core compartido (20 módulos):** Dashboard, CRM (Contactos), Inbox, Calendario, Campañas, Contactos, Segmentos, Grupos, Biblioteca, Analytics, Marketplace, Conexiones, Automatizaciones, AI Studio, Usuarios, Roles, Permisos, Configuración, Logs, Notificaciones.

> Los módulos "Usuarios / Roles / Permisos / Logs" viven dentro de **Configuración**; "Notificaciones" es un overlay global. El resto son rutas de primer nivel.

Cada workspace especializa el Core mediante:
- **Branding** (acento, iniciales) resuelto desde `@nv/domain/config`.
- **Módulos habilitados** (feature flags de UI por workspace).
- **Special View** (futuro): panel vertical propio (ej. Fitness → rutinas; VAROUDUVA → catálogo; Password Vault → bóveda).

---

## 5. Modelo de entidades (capa `@nv/domain`)

Tipos derivados del análisis del diseño (sin datos, solo forma):

- **Workspace** `{ id, name, kind, accent, initials, enabledModules[] }`
- **User / TeamMember** `{ id, name, email, role, online, avatarColor }`
- **Role** `{ id, name, description, userCount }` · **Permission** (matriz `perm × role`)
- **Channel/Provider** `{ id: ChannelId, name, color, softColor }`
- **Connection** `{ id, channel, handle, status: ok|warn|down, token, expiresAt, webhookStatus, permissions[], logs[] }`
- **Campaign** `{ id, name, status, channels[], reach, posts, ctr, progress, nextRunAt }`
- **Post** `{ id, channel, title, copy, scheduledAt, status, campaignId, hashtags[], stats }`
- **Contact** `{ id, name, phone, email, company, tags[], status, stage, createdAt, lastContactAt }`
- **Group** `{ id, name, members, admins, description, tags[], channel }`
- **Segment** `{ id, name, count, color, rules[] }`
- **MediaAsset** `{ id, type: image|video, title, folderId, tag, url }` · **MediaFolder** `{ id, label, count }`
- **Template** `{ id, name, category, body, uses }`
- **Automation** `{ id, name, status, runs, description, nodes[] }` · **AutomationNode** `{ type: trigger|action|wait|cond, label }`
- **CalendarEvent** `{ id, date, channel, title, campaignId }`
- **Integration** `{ id, name, category, connected, description }`
- **Notification** `{ id, type, title, meta, read, createdAt }`
- **Analytics** `{ kpis[], funnel[], platforms[], heatmap, topCampaigns[] }`
- **AuditLog** `{ id, actor, action, target, createdAt }`

Enums: `ChannelId`, `CampaignStatus`, `PostStatus`, `ConnectionStatus`, `ContactStage`, `Role`, `AutomationNodeType`, `WorkspaceKind`, `ModuleId`.

---

## 6. Capa de servicios (contratos, sin implementación)

Cada servicio se define como **interfaz** en `@nv/domain/services`. El frontend consume un **adaptador vacío** que hoy retorna estados vacíos (`[]` / `null`) y mañana se cambiará por HTTP/NestJS sin tocar la UI.

| Interfaz | Integración futura |
|---|---|
| `WorkspaceService` | Postgres/Prisma |
| `AuthService` | NestJS + JWT |
| `ContactService`, `SegmentService`, `GroupService` | Postgres/Prisma |
| `CampaignService`, `PostService`, `CalendarService` | Postgres/Prisma + Redis |
| `InboxService` | WhatsApp/Meta/Telegram webhooks |
| `MediaService` | Cloudinary |
| `TemplateService` | Postgres |
| `AutomationService` | n8n |
| `AnalyticsService` | Postgres/agregaciones |
| `ConnectionService`, `IntegrationService` | OAuth (Meta, Google, …) |
| `AiService` | OpenAI / Anthropic / Gemini |
| `MessagingService` | WhatsApp Business API / Telegram |
| `EmailService` | Resend |
| `BillingService` | Stripe |
| `NotificationService`, `AuditLogService` | Postgres + Redis pub/sub |

Un **`ServiceRegistry`** (inyección simple) expone todos los servicios a la UI. Hoy usa `emptyAdapters` (retornos vacíos + latencia simulada para skeletons); mañana se registra el `httpAdapters`.

---

## 7. Estado global (Zustand)

- **`useWorkspaceStore`** — workspace activo, lista de workspaces, cambio de workspace, apertura del switcher.
- **`useUiStore`** — colapso del sidebar, tema, drawers/modales abiertos (campaign, group, post, connection), panel de notificaciones, toasts.
- **`useCommandStore`** — command palette (abrir/cerrar, query).
- **`useComposeStore`** — estado del wizard de mensaje masivo (paso actual, navegación).

Datos de dominio (contactos, campañas, …) **no** viven en Zustand: se obtendrán vía TanStack Query desde el `ServiceRegistry`. Hoy devuelven vacío → empty states.

---

## 8. Patrón de estados vacíos / carga

Regla única para todas las pantallas con datos:

1. `isLoading` → **Skeleton** con la forma real del contenido (tiles, filas de tabla, cards).
2. `data.length === 0` → **`<EmptyState>`** (icono, título, descripción, CTA para crear el primer registro).
3. Error → **`<ErrorState>`** (mensaje elegante + reintentar).

Componentes: `EmptyState`, `ErrorState`, `Skeleton`, `TableSkeleton`, `CardGridSkeleton`, `KpiSkeleton`. Ningún placeholder inventa métricas: los números se muestran como `—` hasta que exista backend.

---

## 9. Rutas

Base multi-workspace: `/w/[workspace]/<módulo>`.

| Ruta | Módulo |
|---|---|
| `/` | redirect → `/w/<primer-workspace>/dashboard` |
| `/w/[workspace]/dashboard` | Dashboard |
| `/w/[workspace]/calendario` | Calendario (query `?view=mes\|semana\|dia\|agenda\|kanban`) |
| `/w/[workspace]/campanas` | Campañas |
| `/w/[workspace]/contactos` | Contactos (CRM) |
| `/w/[workspace]/grupos` | Grupos |
| `/w/[workspace]/segmentos` | Segmentos |
| `/w/[workspace]/inbox` | Inbox |
| `/w/[workspace]/builder` | Campaign Builder |
| `/w/[workspace]/ai` | AI Content Studio |
| `/w/[workspace]/plantillas` | Plantillas |
| `/w/[workspace]/biblioteca` | Biblioteca |
| `/w/[workspace]/automatizaciones` | Automatizaciones |
| `/w/[workspace]/analytics` | Analytics |
| `/w/[workspace]/marketplace` | Marketplace |
| `/w/[workspace]/conexiones` | Conexiones |
| `/w/[workspace]/configuracion` | Configuración (tabs: equipo, roles, permisos, logs, general) |

Overlays (switcher, command palette, notificaciones, drawers, compose) son globales sobre el shell, controlados por estado, no por ruta.

---

## 10. Fusión con el diseño anterior "NV Core"

El brief pide fusionar las mejores ideas del diseño anterior con el nuevo, eliminando duplicados. Decisiones tomadas (se conserva **una sola** mejor versión):

- **Wordmark + gradiente de marca** → se conserva del nuevo (Newsreader + gradiente azul→púrpura).
- **Sidebar seccionado colapsable** → versión nueva (6 secciones agrupadas) por encima de cualquier lista plana previa.
- **Command Palette ⌘K** → se conserva (mejor patrón de productividad).
- **Workspace Switcher como modal de tarjetas** → se conserva (escala a 14 workspaces).
- **Stat tiles con delta y color semántico** → patrón unificado en `KpiCard`.
- **Drawers laterales** (campaña/grupo/post/conexión) → patrón único `<EntityDrawer>` reutilizable, en vez de un drawer distinto por entidad.
- **Compose como wizard multi-paso** → se conserva; los formularios sueltos de envío se pliegan a este wizard.
- **Mapa de calor + embudo en Analytics** → se conservan como widgets reutilizables.

Duplicados eliminados: múltiples variantes de "card de campaña" → un solo `CampaignCard`; múltiples badges de canal → un solo `ChannelBadge`; distintos vacíos ad-hoc → un único `EmptyState`.

---

## 11. Roadmap de habilitación del backend (fase 2, no ahora)

1. `apps/api` NestJS: módulos espejo de `@nv/domain/services`.
2. Prisma schema desde §5; Postgres con **columna `workspaceId` (multi-tenant)** en toda entidad.
3. Redis para colas (scheduler de posts) y cache.
4. n8n para automatizaciones (nodos ↔ `AutomationNode`).
5. OAuth (Meta Graph, Google) → `ConnectionService`.
6. Webhooks WhatsApp/Telegram → `InboxService`.
7. IA (OpenAI/Anthropic/Gemini) detrás de `AiService` con selección de proveedor.
8. Stripe (billing), Cloudinary (media), Resend (email).
9. Cambiar `emptyAdapters` → `httpAdapters` en el `ServiceRegistry`. **La UI no cambia.**

---

## 12. Definición de "hecho" para esta fase

- [x] `IMPLEMENTATION_PLAN.md` (este documento).
- [x] Monorepo pnpm + Turborepo, TS estricto.
- [x] `@nv/domain`: entidades, enums, interfaces de servicio, config de workspaces/providers/nav.
- [x] Design system exacto (tokens, Tailwind preset, fuentes, dark theme).
- [x] App shell fiel: sidebar seccionado colapsable, topbar, workspace switcher, command palette, notificaciones, toasts.
- [x] Las 16 rutas del Core + 14 workspaces enrutados.
- [x] Cada pantalla con su layout y **estados vacíos / skeletons** (sin datos falsos).
- [x] Stores Zustand, providers (Query/Theme), hooks y componentes reutilizables.
- [x] Servicios como interfaces + adaptadores vacíos.
- [x] Compila (`pnpm build`) y corre (`pnpm dev`).
