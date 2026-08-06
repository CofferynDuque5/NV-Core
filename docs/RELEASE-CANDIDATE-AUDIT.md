# NV Core — Release Candidate Audit (v2)

> Auditoría integral en modo Release Candidate (roles: CEO, CTO, PM, Arquitecto,
> UX/UI, QA, Performance, Security, DevOps, A11y, SRE, Tech Writer). Regla: no se
> asume que algo está bien porque funciona; el estándar es **SaaS comercial
> premium**. Re-ejecución tras Calendario S1–S5 + Media Library premium.

## Veredicto (Fase 11): 🔴 **NO publicar todavía**

Avance real desde la v1: **las 9 fases del roadmap P0 están a nivel premium**
(Calendario, Media Library, Analytics, Workflow Builder, Campaign Builder, Inbox
Omnicanal, CRM, AI Content Studio y **Marketplace**) sobre una base técnica
sólida y con **higiene de código verificada**. El roadmap de producto queda
**feature-complete**. El bloqueo de release **ya no depende del roadmap**, sino
de que **no existe ninguna pieza de adopción** (onboarding, ayuda, changelog,
estado, backups, import/export) y de que falta el hardening final (WCAG formal,
carga con Redis). Se mantiene el **bloqueo de release** y se entrega el backlog
actualizado.

---

## Fase 1 — Feature complete (roadmap)

| Fase | Módulo | Estado | Cambio vs v1 |
|---|---|---|---|
| 1 | Calendario Inteligente | ✅ Premium | = |
| 3 | **Media Library** | ✅ Premium (baseline) | 🟡→✅ búsqueda, carpetas, etiquetas, edición. *Falta versionado/compresión (P2).* |
| 2 | **Campaign Builder** | ✅ Premium (baseline) | 🔴→✅ editor visual por capas (texto/precio/botón/etiqueta/imagen/fondo), arrastre+redimensión, z-order, inspector, formatos y export SVG/PNG; diseños reutilizables. *Falta plantillas prediseñadas y multi-selección (P2).* |
| 4 | **Workflow Builder** | ✅ Premium (baseline) | 🔴→✅ editor visual de nodos (disparador/acción/espera/condición), conexiones, inspector, validación y guardado; sincroniza con la orquestación (n8n oculto). *Falta ramas por condición y test-run (P2).* |
| 5 | **AI Content Studio** | ✅ Premium (baseline) | 🟡→✅ tipo de contenido + longitud, variantes con mejorar/guardar-plantilla/hashtags, panel de hashtags. *Falta generación de imágenes (P2).* |
| 6 | **Analytics** | ✅ Premium (baseline) | 🟡→✅ período 7/30/90, KPIs con delta vs período anterior, serie temporal, embudo CRM, tasas de conversión y **heatmap de actividad**. *Falta cohortes/exportación (P2).* |
| 7 | **Inbox Omnicanal** | ✅ Premium (baseline) | 🟡→✅ asignación por responsable, etiquetas de triage, filtros (búsqueda/canal/estado/responsable). *Falta notas internas y snippets (P2).* |
| 8 | **CRM** | ✅ Premium (baseline) | 🟡→✅ pipeline kanban con arrastre entre etapas, ficha con actividad/notas, filtros y vista tabla↔pipeline. *Falta campos personalizados y tareas (P2).* |
| 9 | **Marketplace** | ✅ Premium (baseline) | 🔴→✅ catálogo de apps instalables por workspace (10 apps curadas), búsqueda + chips de categoría, instalar/desinstalar con persistencia (modelo `AppInstallation`), ficha de app con features, contador de instaladas. *Falta configuración por app y facturación de add-ons (P2).* |

---

## Fase 2 — Product audit (1–10; se exige ≥ 9.5)

| Módulo | v1 | v2 | Motivo |
|---|---:|---:|---|
| Calendario | 9.0 | 9.0 | Falta QA en dispositivos, virtualización, DnD por teclado. |
| Conexiones | 8.5 | 8.5 | Sólido; sin feedback de estado en vivo. |
| **Media Library** | 6.0 | **8.5** | Búsqueda/carpetas/etiquetas/edición; falta versionado/uso-por-campaña. |
| Configuración | 8.0 | 8.0 | — |
| Inbox | 7.5 | **9.0** | Asignación, etiquetas y filtros (búsqueda/canal/estado/responsable). Falta notas internas. |
| Campañas | 7.5 | 7.5 | — |
| Dashboard | 7.5 | 7.5 | No es BI ejecutivo. |
| AI Studio | 7.0 | **9.0** | Tipo/longitud, mejorar/guardar-plantilla/hashtags por variante, panel de hashtags. Falta generación de imágenes. |
| CRM | 7.0 | **9.0** | Pipeline kanban con DnD, ficha con notas/actividad, filtros y doble vista. Falta campos personalizados. |
| Analytics | 6.5 | **8.5** | Período comparativo, deltas, serie temporal, embudo, conversión y heatmap. Falta cohortes/exportación. |
| Marketplace | 5.0 | **8.5** | Catálogo de apps instalables por workspace con instalación real persistida, búsqueda, categorías y ficha. Falta configuración por app y facturación de add-ons. |
| Campaign Builder | 4.0 | **8.5** | Editor por capas con arrastre/redimensión, z-order, estilos y export. Falta plantillas prediseñadas. |
| Workflow Builder | 4.0 | **8.5** | Editor visual de nodos, conexiones, inspector, validación y guardado. Falta ramas por condición y test-run. |

**Ninguno alcanza 9.5** → sigue habiendo trabajo antes del release.

---

## Fase 3 — UX audit
- Calendario y Media Library marcan el estándar (contexto <3s, filtros, acciones
  in-place, estados vacíos/carga/error consistentes). El resto no lo iguala.
- Persiste el mayor hueco de UX: **no hay onboarding** — el usuario nuevo entra a
  un panel vacío sin guía ni datos de ejemplo.

## Fase 4 — Code audit (verificado en esta re-ejecución)
- ✅ `0 console.log`, `0 catch {}`, `0` usos de `any` en el frontend, sin
  `TODO/FIXME` reales, sin dead-code relevante. Deuda **muy baja**.

## Fase 5 — Performance
- ✅ Rutas `React.lazy` + code-splitting, gzip en Nginx, colas opcionales,
  imágenes `loading="lazy"` en la Biblioteca.
- ⏳ **Pendiente (P1):** virtualización de listas largas (Inbox/Contactos),
  medición real de TTI, presupuesto de bundle (~136 kB gzip principal).

## Fase 6 — Security (verificado)
- ✅ Sin `.env` versionado; **sin sinks XSS** (`dangerouslySetInnerHTML`/`innerHTML`);
  JWT+refresh (cookie httpOnly); guards de rol/workspace; `ValidationPipe`
  (`whitelist` + `forbidNonWhitelisted`); rate limiting; cifrado en reposo;
  CORS restringido; Prisma parametrizado (sin SQLi); secreto del bridge n8n.
- ✅ **CORREGIDO (RC):** **security headers** ahora activos — API con **helmet**
  (X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, COOP/CORP,
  sin `X-Powered-By`) y el SPA con **CSP + HSTS + X-Frame-Options + nosniff +
  Referrer/Permissions-Policy** en Nginx.
- ✅ **CORREGIDO (RC, re-ejecución):** el **webhook entrante de WhatsApp**
  (`POST /api/integrations/whatsapp/webhook`) era `@Public()` **sin verificación
  de firma** — cualquiera podía inyectar mensajes en el Inbox. Ahora valida
  **HMAC-SHA256 `X-Hub-Signature-256`** contra `META_APP_SECRET` con
  `timingSafeEqual`, **fail-closed** (rechaza si falta secreto/cabecera/firma).
  Verificado en vivo: sin firma → 403, firma inválida → 403, firma válida → 200;
  +4 tests unitarios (`inbound.spec.ts`).
- 🔴 **Pendiente (decisión de política, pre-GA):** el webhook de **Telegram**
  falla-abierto si `TELEGRAM_WEBHOOK_SECRET` no está (endurecer a fail-closed en
  prod); `GET /api/workspaces` y `/:slug` son `@Public()` y **enumeran todos los
  tenants** (id/slug/nombre/módulos) a cualquiera — decidir si se gatea tras auth
  o se limita al workspace del login.
- 🟡 **Pendiente (hardening, no bloqueante):** hashing de password con `scrypt`
  (defaults) en vez de argon2id/bcrypt con coste ajustado; sin lockout por cuenta
  (solo throttle por IP); compare no-timing-safe en el bridge n8n.
- 🔴 **Pendiente (P1):** pen-test formal; revisión de límites de subida y
  logging de datos sensibles.

## Fase 7 — Testing (verificado, verde)
- ✅ **API: 169 unit** (33 files, incl. **6 de carga/estrés** del core async) ·
  **Web: 81 unit** · **8 E2E** (auth, calendar, crud, inbox, campaigns, media,
  route-smoke y **aislamiento multi-tenant**). `packages/domain`: 0 tests.
- ✅ **CORREGIDO (re-ejecución, bloque operabilidad):** cubiertas las **rutas de
  valor** que estaban sin test — `campaign-runner` (isDue + bucle de envío WA +
  publicación social + transiciones de estado, 9 tests), `scheduler`
  (schedule/cancel/publish idempotente, 6), `social/meta` (FB feed/foto/reel, IG
  feed/reel/carrusel, `publish` que nunca lanza, 11) y `team` (miembros + conteo
  de roles, 3). **E2E de aislamiento multi-tenant** (7 casos): owner B no puede
  listar/crear en el workspace de A (403), su workspace nunca contiene datos de
  A, y sin token → 401. Verificado en vivo contra API+DB reales. CI corre ahora
  también los unit de web.
- 🟡 **Pendiente (P2):** specs de `whatsapp.service`/Baileys (muy acoplado a
  sockets), tests de componentes/hooks del front, gate de cobertura numérico.
- ✅ **CORREGIDO (RC):** E2E **por módulo** ampliado (campañas CRUD+run/pause,
  Media Library búsqueda/filtros, y **smoke de las 17 rutas** que verifica que
  cada módulo monta sin crash) + suite de **carga/estrés** para QueueManager /
  JobManager / EventBus (cientos de jobs concurrentes, tormenta de reintentos,
  fan-out con aislamiento de handlers). Los E2E se validaron localmente contra
  API+DB reales (Postgres efímero).
- ⏳ **Pendiente (P1/P2):** carga/estrés de red real (Socket.IO/BullMQ con Redis
  bajo concurrencia), regresión ampliada por navegador/dispositivo.

## Fase 8 — Accessibility
- ✅ Roles/aria en Calendario, color + etiqueta (no solo color), labels en forms,
  `aria-label` en búsqueda/acciones de la Biblioteca.
- ✅ **CORREGIDO (RC):** **skip link** (`#main-content`, WCAG 2.4.1) + landmark
  `<main>` enfocable en el shell; `prefers-reduced-motion` neutraliza
  animaciones/transiciones (WCAG 2.3.3); `aria-label` con conteo en el botón de
  notificaciones.
- ⏳ **Pendiente (P1):** auditoría **WCAG** formal, contraste en ambos temas,
  **DnD accesible por teclado** completo.

## Fase 9 — Product polish
- Calendario y Media Library pulidos; el resto necesita el mismo pase.

## Fase 10 — Documentación
- ✅ Existe: `SETUP`, `COMO_VERLO`, `AUDITORIA-ARQUITECTURA`, `NV-CORE-FUNCIONALIDADES`, este RC.
- ⏳ **Pendiente (P1/P2):** ADRs, runbook de deployment, referencia de variables, diagramas.

---

## Backlog priorizado (orden acordado)

### P0 — Feature-complete del roadmap (nivel premium)
1. ✅ **Analytics** (período comparativo, deltas, serie temporal, embudo, conversión, heatmap) — HECHO dentro del freeze.
2. ✅ **Workflow Builder** (editor visual de nodos + conexiones + validación + guardado; n8n oculto) — HECHO dentro del freeze.
3. ✅ **Campaign Builder** (editor visual por capas + arrastre/redimensión + z-order + export SVG/PNG) — HECHO dentro del freeze.
4. ✅ **Inbox** (asignación + etiquetas + filtros) — HECHO. · ✅ **CRM** (pipeline kanban + notas + filtros) — HECHO. · ✅ **AI Studio** (tipo/longitud + mejorar/hashtags/plantilla) — HECHO. · ✅ **Marketplace** (catálogo de apps instalables por workspace + instalar/desinstalar persistido + búsqueda/categorías/ficha) — HECHO dentro del freeze.

**P0 completo: roadmap feature-complete (9/9 fases a nivel premium).**

### P1 — Piezas de adopción (ninguna existe)
5. Onboarding interactivo · 6. Centro de ayuda + KB · 7. Tour contextual ·
8. Feedback · 9. Changelog · 10. Página de estado · 11. Backups/restore ·
12. Import/Export (contactos, campañas, plantillas).

### P1 — Hardening detectado por el RC
13. ✅ **Security headers (helmet + CSP + HSTS)** — HECHO. · 14. Virtualización de listas ·
15. 🟡 **A11y base** (skip link, landmark, reduced-motion, aria-label notif.) — HECHO;
falta WCAG formal + DnD por teclado + contraste. ·
16. 🟡 **E2E por módulo + carga/estrés** — HECHO (campaigns/media/route-smoke +
suite de carga del core async; un bug de diálogo alto sin scroll detectado y
corregido); falta carga real con Redis/Socket.IO (P2).

### P2 — DevOps / Docs
17. Runbook de deployment · referencia de variables · ADRs · diagramas ·
smoke real end-to-end contra backend+DB.

---

## Fase 12 — Re-ejecución RC (auditoría independiente por dimensiones)

Re-ejecución con 4 auditorías paralelas (producto, seguridad, performance/a11y,
tests/devops/docs), **verificando por lectura del código real** + build/tests
como fuente de verdad. Estado objetivo: typecheck ✅, build ✅, lint web ✅,
API 140 unit + web 81 unit ✅.

### Lo que está sólido (verificado, no asumido)
- **Arquitectura auth/tenancy/crypto**: JWT global guard, `WorkspaceGuard` +
  `@Roles` en los 30+ controladores de tenant, scoping por `workspaceSlug` del
  guard (no del body), refresh opaco hasheado y rotado, reset/verify de un solo
  uso, AES-256-GCM para tokens en reposo, Stripe webhook con HMAC+replay, OAuth
  Google con `state` firmado. Sin SQL raw. Sin fuga de `passwordHash`.
- **Producto**: las **9 fases del roadmap son premium de verdad** (data real,
  skeletons, estados vacío/error, mutaciones con optimismo/undo/confirm). **Sin
  datos falsos** en el frontend (el modo demo con adaptadores vacíos es honesto y
  documentado). Deuda de código muy baja (0 TODO/FIXME reales).
- **DevOps base**: Dockerfiles multi-stage, docker-compose (pg+redis+api+web con
  healthchecks), CI (typecheck/lint/build/tests + E2E con Postgres efímero),
  18 migraciones coherentes, `.env.example` completo con validación zod, Sentry +
  request-id + helmet.

### Bloqueadores / huecos encontrados (nuevos vs. el doc previo)
1. **[SEG · CORREGIDO en esta re-ejecución]** Webhook WhatsApp sin firma → ahora
   HMAC fail-closed (ver Fase 6).
2. **[SEG · política, pre-GA]** Telegram fail-open sin secreto; `GET
   /api/workspaces` público enumera todos los tenants.
3. **[PRODUCTO · bugs cliente-visibles, RC-detectados, aún abiertos]**
   - **Segmentos** (`segmentos/page.tsx:45`): `{() => null}` — nunca lista, aun
     con datos del backend.
   - **Dashboard** (`dashboard/page.tsx:92,140`): "Publicaciones de hoy" y
     "Campañas activas" renderizan `null` cuando **hay** datos; y `:61-62` dos
     KPIs con `value={null}` fijo (sin fuente de datos).
   - **Notificaciones** (`notifications-panel.tsx:21`): botón "Marcar leídas" sin
     `onClick` (el endpoint backend existe; el contrato no lo expone).
4. **[OPS · bloqueadores de release]** `main.ts` **no llama
   `enableShutdownHooks()`** (los `onModuleDestroy` no drenan en SIGTERM);
   `/api/health` devuelve un **flag de config, no un ping real** a DB/Redis; sin
   estrategia de **backups/restore**; sin **runbook de deploy/rollback**;
   `docker-compose.yml:46-47` trae **credenciales de admin personales por
   defecto** + `JWT_SECRET` default; **`README` raíz desactualizado** (dice que
   el backend "no está implementado", falso).
5. **[TESTS · P1]** 11/25 módulos API sin spec, incl. rutas de valor
   (social/scheduler/campaign-runner/whatsapp, workspaces/team); `packages/domain`
   sin tests; sin E2E de aislamiento multi-tenant ni de billing.
6. **[A11Y · borderline]** El **editor de workflows** (canvas) es 100% mouse
   (`workflow-editor.tsx:248`): nodos sin `tabIndex`/rol/teclado — inaccesible por
   teclado/AT. Design editor y kanban CRM: degradados pero con ruta alternativa.
7. **[PERF · P2 escala]** `findMany` sin límite en varias listas (peor:
   `inbox.messages`), Analytics cuenta en JS, el frontend **capa contactos a 100**
   y filtra en cliente (búsqueda pierde registros >100), faltan índices compuestos
   `(workspaceSlug, createdAt)` y virtualización de listas.

### Qué falta para una versión ESTABLE (priorizado)

**Bloque 1 — Operabilidad (EN CURSO):**
- ✅ **HECHO:** `enableShutdownHooks()` (drena Prisma + workers BullMQ en SIGTERM,
  verificado en vivo) + `/api/health` (liveness) y `/api/health/ready`
  (readiness con **ping real** a DB `SELECT 1` + Redis; 503 si la DB cae —
  verificado en vivo).
- ✅ **HECHO:** **backups/restore** de Postgres (`scripts/backup-db.sh` con dump
  `-Fc` + rotación + verificación, `scripts/restore-db.sh` transaccional) y
  **runbook** `docs/OPERATIONS.md` (deploy, health, backups, rollback, observab.).
- ✅ **HECHO:** `docker-compose.yml` sin credenciales/secretos por defecto
  (JWT obligatorio vía `.env`, admin opcional); README raíz corregido.
- ✅ **HECHO:** **ESLint flat** para `@nv/api` (el lint ya corre: 0 errores,
  4 warnings de `any` en `meta.service`).
- ✅ **HECHO:** cobertura de rutas de valor (campaign-runner, scheduler,
  social/meta, team; +29 unit) y **E2E de aislamiento entre tenants** (7 casos);
  web unit tests añadidos al CI. Ver Fase 7.
- ⏳ **Pendiente (P2):** gate numérico de cobertura; specs de whatsapp/Baileys;
  tests de componentes del front.

**Bloque 1 — Operabilidad: COMPLETO.**

**Bloque 2 — Adopción (P1):** onboarding, centro de ayuda/KB, tour, feedback,
changelog, página de estado, import/export.

**Bloque 3 — Calidad de producto (RC-detectado):** arreglar Segmentos, los 2
paneles + 2 KPIs del Dashboard, y "Marcar leídas"; decidir política de los 2
ítems de seguridad (Telegram, enumeración de workspaces).

**Bloque 4 — Escala/A11y (P2):** teclado en el editor de workflows, paginación +
índices compuestos + virtualización, carga real con Redis/Socket.IO, WCAG formal.

---

## ¿Publicarías este producto a clientes reales? **NO.**
9 de 9 fases premium (roadmap P0 feature-complete), pero **0 de 8 piezas de
adopción** y hardening (WCAG formal, carga real con Redis) pendiente. La base es
sólida y limpia; con P0 cerrado y el bloqueador de seguridad del webhook WhatsApp
corregido, el siguiente bloque acordado es **operabilidad** (shutdown/health,
backups+runbook, ESLint API + cobertura de rutas de valor), luego adopción (P1),
y luego re-auditar.
