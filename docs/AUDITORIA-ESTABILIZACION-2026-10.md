# NV Marketing — Auditoría y estabilización, etapa 1 (24-oct-2026)

Revisión hecha sobre el código de la rama `claude/multi-workspace-platform-setup-67l48t`
(commit `924a199`), no sobre informes previos. Cada estado cita el archivo que lo sustenta.
Las cifras de informes anteriores se trataron como datos por verificar.

## 1. Documentos e instrucciones

| Documento | Estado |
|---|---|
| `CLAUDE.md` / instrucciones del repo | **No existe** en el repositorio. Se usaron las instrucciones del proyecto. |
| Especificaciones y hoja de ruta | Solo en los archivos del proyecto (`NV-Marketing-documentos.zip` → `NV-Marketing-especificaciones-y-hoja-de-ruta.pdf`), **no en el repo**. |
| Identidad visual | Solo en los archivos del proyecto (PDF + `NV-Marketing-Logo-Megafono.zip`). No se tocó la interfaz en esta etapa. |
| Docs internas | `docs/RELEASE-CANDIDATE-AUDIT.md`, `CTO-AUDIT.md`, `AUDITORIA-ARQUITECTURA.md`, `OPERATIONS.md`, `DESPLIEGUE-HOSTING.md`, `whatsapp-campaigns.md`. Algunas afirmaciones ya no coinciden con el código (ver §3). |

## 2. Arquitectura verificada

- Monorepo pnpm + Turborepo: `apps/web` (React 19 + Vite), `apps/api` (NestJS 11), `packages/domain`.
- Base de datos: PostgreSQL + Prisma 6.19 — **43 modelos** y **38 migraciones** (`apps/api/prisma`).
  Las 38 migraciones se aplicaron sin error sobre un PostgreSQL vacío; la única deriva entre
  migraciones y `schema.prisma` es previa: el valor por defecto de `Conversation.labels`.
- **35 módulos** de API en `apps/api/src/modules`.
- Colas: `QueueManager` usa BullMQ si hay `REDIS_URL`; **sin Redis ejecuta los jobs en memoria**
  (`core/queue/queue-manager.service.ts`). El paquete para cPanel (`scripts/empaquetar-cpanel.mjs`)
  no configura Redis, así que en cPanel todo corre en memoria. Las migraciones se aplican al arrancar.
- Despliegues soportados: cPanel/Passenger (`pnpm cpanel`), Render (`render.yaml`), Docker Compose.
- Pruebas: API 441 unitarias en verde antes del cambio (66 archivos); web con Vitest + 8 E2E Playwright.
  CI en `.github/workflows/ci.yml`: typecheck, lint, build, unitarias y E2E con Postgres efímero.

## 3. Estado por módulo (verificado en código)

**Funcionan (flujo completo en código, con pruebas):**
- Auth + workspaces + roles: guard JWT global, `WorkspaceGuard` + `@Roles`, tenant por slug del guard.
  El listado público de workspaces que señalaba el RC **ya no es público** (los únicos `@Public()` son
  auth, health, métricas, webhooks, formularios/funnels/afiliados públicos y OAuth de Google).
- Webhooks entrantes: WhatsApp con HMAC y Telegram ya **fail-closed** (`inbox.module.ts:390`), el RC
  estaba desactualizado en este punto.
- Campañas a grupos de WhatsApp/Telegram con historial (`SendLog`), ritmo anti-baneo, reintentos
  por error transitorio y pausa efectiva (`campaign-runner.service.ts`). **Ver §4 para lo corregido.**
- Secuencias (drip): basadas en `nextRunAt` en base de datos, sobreviven reinicios.

**Parciales:**
- **Inbox**: sin búsqueda ni paginación en servidor. `conversations()` devuelve como máximo 500
  conversaciones ordenadas por **fecha de creación**, no por actividad (`inbox.module.ts:181`): una
  conversación antigua con mensajes nuevos puede quedar fuera de la lista. Los filtros son de cliente.
- **Automatizaciones**: solo reaccionan a mensajes entrantes; el nodo «esperar» se **ignora**
  (`automation-runner.service.ts:18`). No hay esperas persistentes, simulación ni historial por ejecución.
- **Publicaciones programadas**: `PostScheduler.publish()` marca el post como `sent` y crea la
  notificación «Publicación enviada» **sin llamar a ningún proveedor** (`scheduler/post-scheduler.service.ts`).
  Además, sin Redis los posts programados nunca se procesan. Es un estado de éxito falso.
- Analítica: hay agregados reales, pero no indica fuente, período ni fecha de actualización por métrica.

**Faltan:**
- **Consentimiento y bajas**: el esquema no tiene ningún campo de consentimiento/opt-out en contactos.
  Las secuencias y campañas no pueden respetar bajas porque no se registran.
- Catálogo, pedidos, pagos verificables por marca, páginas de captación con atribución, tareas/Kanban.

**Dependen de credenciales o proveedores (no se probaron con servicios reales):**
WhatsApp (Baileys o Cloud API), Telegram, Meta (Facebook/Instagram), Stripe, OpenAI/Anthropic/Gemini,
Google OAuth, Cloudinary/ImgBB, Resend, Ayrshare, n8n, Sentry. Redis es opcional pero cambia el
comportamiento de colas y publicaciones programadas.

## 4. Corrección implementada: campañas que sobreviven reinicios

**Riesgo encontrado (el mayor en envíos):**
1. Sin Redis, si el proceso se reinicia a mitad de una campaña (Passenger recicla procesos), el job
   se pierde. La campaña «una vez» queda en `activa` para siempre (el tick solo toma las `programada`),
   los chats pendientes nunca reciben el mensaje y no queda ningún registro del fallo.
2. El chat que se estaba enviando queda como «en curso…» indefinidamente en el Historial.
3. El reintento del job tras un error caía en la protección de 90 s y terminaba como «completado»
   sin enviar nada (éxito falso en la lista de jobs).
4. La reserva de chat (`findFirst` y luego `create`) no era atómica entre procesos.
5. La ventana anti-spam de 20 h saltaba en silencio la 2.ª y siguientes franjas de las campañas
   «varias veces al día» (función añadida en `9b7a0f6`, anulada por `44f6502`).

**Solución:** cada ejecución tiene una clave idempotente (`Campaign.runKey`) y un latido
(`runHeartbeatAt`); cada chat se reserva con un índice único `(campaignId, groupId, runKey)`.
El tick reanuda las ejecuciones con latido vencido usando la misma clave, marca como
«Sin confirmar» lo que estaba a medias (no se reenvía ni cuenta como éxito) y el resultado final
se calcula sobre toda la ejecución. Detalle en `docs/whatsapp-campaigns.md`.

## 5. Correcciones de la etapa 1b

- **Publicaciones programadas** (`scheduler/post-scheduler.service.ts`): ya no se marcan «enviadas»
  sin publicar. Se publican por el proveedor activo del canal (`ProviderManager.publish`); solo si el
  proveedor acepta pasan a `sent`, si no a `error` con el motivo en una notificación. Un barrido en
  base de datos cada minuto las procesa aunque no haya Redis (cPanel). La reserva
  `scheduled → publishing` es atómica, así que la cola y el barrido no publican dos veces. Una
  publicación cortada por un reinicio queda como error «sin confirmar», sin reenviarse.
  Migración `20261024010000_post_publish_tracking` (columna `publishStartedAt` + índice).
- Los estados `publishing`, `sent` y `error` ya no se pueden poner a mano por la API (inflaban la
  analítica). Una publicación con error se reprograma moviéndola de fecha.
- **Inbox**: la lista toma las 500 conversaciones con actividad más reciente (último mensaje), no las
  500 creadas más recientemente.
- **Marca**: logo del megáfono en toda la app, íconos PWA, favicon y página de ventas.

## 6. Siguiente paso recomendado

Consentimiento/bajas en contactos; búsqueda + paginación del Inbox en servidor; nodo «esperar» de
las automatizaciones.
