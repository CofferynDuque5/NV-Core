# NV Core — Auditoría de arquitectura y consolidación

> Iteración de **consolidación** (sin nuevas funcionalidades). Objetivo: revisar
> dependencias entre módulos, duplicación, deuda técnica, complejidad, cuellos
> de botella, consistencia de nombres, estructura de carpetas y cumplimiento de
> SOLID; aplicar mejoras seguras y documentar las decisiones.

**Alcance:** `apps/api/src`, `apps/web/src`, `packages/*`. Se excluye la app
independiente `nsap/` (legacy, autocontenida).

**Verificación:** `pnpm --filter @nv/api build` ✅ · **92 tests** ✅ · la API
arranca y resuelve todo el grafo DI ✅ · `pnpm --filter @nv/web build` (dist) ✅.

---

## 1. Resumen

La base está sana tras el refactor previo (ProviderManager como único punto de
entrada + EventBus/Queue/Job + n8n orquestador). La auditoría encontró
principalmente **deuda cosmética y duplicación**, no fallas estructurales. Se
aplicaron las consolidaciones de bajo riesgo y alto valor; el resto se registró
como **decisiones deliberadas** o **recomendaciones** para no desestabilizar una
base recién migrada.

---

## 2. Hallazgos y mejoras aplicadas

### 2.1 Código muerto (backend) — ✅ corregido
`messaging.providers.ts` quedó como residuo del refactor de ProviderManager:
`deliverMessage`, `isChannelConfigured`, `isMessagingChannel`,
`MESSAGING_CHANNELS` y `MessagingChannel` ya no tenían ningún consumidor (solo se
referenciaban entre sí y en su propio test).

- **Aplicado:** el archivo se **renombró a `messaging.transport.ts`** (su rol
  real: transporte HTTP puro de WhatsApp Cloud API + Telegram) y se **podó** todo
  lo muerto, dejando solo `sendWhatsApp`, `sendTelegram` y `OutboundMessage`.
- El test se reescribió (`messaging.transport.spec.ts`) para cubrir el **código
  vivo** (transporte real con `fetch` mockeado) en vez del código muerto.

### 2.2 Dos stacks de colas BullMQ en paralelo — ✅ unificado
`PostScheduler` montaba su **propia** conexión IORedis + Queue + Worker
(cola `"posts"`), duplicando toda la infraestructura del `QueueManager`
(cola `"nv-jobs"`) creado en el refactor: doble conexión a Redis, mismo patrón
`enabled`, misma lógica de `enqueue`/`cancel`.

- **Aplicado:** `PostScheduler` ahora **usa el `QueueManager` central**: registra
  el procesador `post.publish` y encola/cancela a través de él. Se eliminó su
  IORedis/Queue/Worker propios. Una sola conexión y un solo stack de colas.
- Se preserva el comportamiento sin Redis (un post futuro **no** se publica al
  instante): `schedule()` retorna `false` cuando el `QueueManager` está inline.

### 2.3 Duplicación de formateo de JID (backend) — ✅ corregido
`baileys.session.ts` reimplementaba inline `${digits}@s.whatsapp.net`, lógica que
ya encapsula `toJid` en `whatsapp.types.ts`.

- **Aplicado:** `sendMedia` delega en `toJid` (una sola fuente de verdad).

### 2.4 Duplicación en el frontend — ✅ corregido
- **Etiquetas/colores de estado de conexión** estaban en 3 sitios (`status-dot`,
  `connection-dialog`, página `conexiones`). → Centralizados en
  `lib/connection-status.ts` (`CONNECTION_STATUS_LABEL` / `_COLOR`).
- **Subida a Cloudinary** (bloque `FormData` + `fetch` + parseo de error) estaba
  copiado en dos mutaciones. → Extraído a `lib/cloudinary.ts`
  (`uploadToCloudinary`).
- **Formateadores de fecha** dispersos (`relativeTime`, `formatDate`). →
  Centralizados en `lib/utils.ts` (`relativeTime`, `formatDateTime`).

### 2.5 Referencias obsoletas a Next (frontend) — ✅ corregido
Tras la migración a Vite quedaban menciones a `NEXT_PUBLIC_API_URL`, incluidas
**dos visibles al usuario** (`backend-notice`, `form-dialog`) que indicaban la
variable equivocada. → Todas cambiadas a `VITE_API_URL`; se eliminaron los
`eslint-disable @next/next/...` muertos.

---

## 3. Dependencias entre módulos

El grafo quedó **acíclico y con una dirección clara** tras el refactor previo, y
esta iteración lo confirma (la API arranca sin errores de resolución):

```
CoreModule (@Global: EventBus, QueueManager, JobManager)
        ▲
PrismaModule (@Global) · CommonModule (@Global: Mail, Audit, Crypto, Guards)
        ▲
WhatsappModule ── (WhatsappService) ─┐
MetaModule ────── (MetaService) ─────┤
                                     ▼
                             ProvidersModule ── (ProviderManager, OutboundDispatcher)
                                     ▲
        ┌───────────────┬────────────┼───────────────┬──────────────┐
   CampaignsModule  MessagingModule  InboxModule  SocialModule  AutomationsModule
```

- **Regla:** `ProvidersModule` es el hub de salida; los módulos de feature
  dependen de él, nunca al revés. La extracción de `MetaModule` (transporte
  Graph) rompió el único ciclo potencial (Social ↔ Providers).
- No se detectaron dependencias circulares ni `forwardRef`.

---

## 4. Decisiones arquitectónicas adoptadas

Cosas revisadas donde **se decidió no cambiar** (con motivo), para no introducir
churn ni riesgo sin beneficio funcional:

1. **Módulos Nest "de un solo archivo"** (Controller + Service + DTOs dentro de
   `*.module.ts`). La mayoría de features CRUD siguen este patrón; solo los
   módulos con lógica pesada (whatsapp, providers, campaigns, core) se dividen en
   archivos.
   **Decisión:** es un patrón **intencional y consistente por regla**: archivo
   único para módulos CRUD cohesivos; se divide cuando un módulo adquiere un
   worker en segundo plano, adapters o múltiples servicios. Reescribir ~20
   módulos sería alto churn y cero ganancia funcional.

2. **`auth/` y `health/` como carpetas de nivel superior** (hermanas de
   `modules/`). **Decisión:** `auth` es infraestructura fundacional que se carga
   antes que las features; se mantiene fuera de `modules/` a propósito.

3. **Tres raíces transversales — `core/`, `providers/`, `common/`.**
   **Decisión:** capas con responsabilidades distintas y estables:
   `common/` = utilidades cross-cutting (guards, crypto, mail, tenant);
   `core/` = infraestructura de ejecución (eventos, colas, jobs);
   `providers/` = integración con el exterior (ProviderManager + adapters).
   `OutboundDispatcher` vive en `providers/` porque orquesta despachos de
   providers (aunque use `JobManager`).

4. **`providers-adapters.tsx` llama `fetch` directo** (en vez de pasar por la
   capa `Services`/http-adapters). **Decisión:** aceptable a corto plazo; se
   documenta como recomendación (ver §5) para plegarlo al contrato `Services`
   cuando se toque de nuevo, sin ampliarlo en esta iteración de consolidación.

---

## 5. Recomendaciones (follow-ups, fuera de alcance de esta iteración)

- **Frontend — carpeta `src/app/`:** conserva convenciones de Next (`page.tsx`,
  carpetas con corchetes `[workspace]`, `not-found.tsx`, `globals.css`) aunque el
  enrutado ya lo hace `app-routes.tsx` con react-router. Renombrar
  `app/ → pages/` y `[workspace] → workspace` es mecánico pero invasivo; se pospone
  para no desestabilizar la migración recién hecha.
- **Frontend — `providers-adapters.tsx`:** mover sus llamadas REST al contrato
  `Services` (unifica el `fetch` con auth que hoy existe en `http-adapters`,
  `auth-client` y este componente).
- **Backend — sufijos de archivo:** unificar convención (`*.service.ts`) para
  helpers sueltos como `session-manager.ts`, `inbound.ts`, `render.ts`,
  `cloudinary.ts`, `stripe.client.ts`.
- **`MetaService`** concentra publicación FB/IG + Reels/Story/carrusel + insights
  + subida resumable; si crece, considerar dividir por responsabilidad (SRP).

---

## 6. SOLID — evaluación breve

- **SRP:** bien en la capa de providers (cada adapter, una integración) y core
  (EventBus/Queue/Job separados). Punto de atención: `MetaService` y algunos
  módulos "gordos" (ver §4.1 y §5).
- **OCP:** el patrón Provider+Adapter permite añadir proveedores/adapters sin
  tocar el resto (se cumple).
- **LSP:** todos los adapters cumplen la misma interfaz `ChannelAdapter`;
  `BaseAdapter` da defaults "no soportado" honestos.
- **ISP:** interfaz de adapter única y amplia (9 métodos); aceptable por
  uniformidad, con `AdapterUnsupportedError` para capacidades no aplicables.
- **DIP:** el resto del sistema depende de la abstracción `ProviderManager`, no
  de APIs externas concretas (se cumple tras el refactor).

---

## 7. Cambios aplicados (resumen de archivos)

| Área | Cambio |
|---|---|
| `messaging.transport.ts` (nuevo) | Transporte puro wa/tg; poda de código muerto |
| `messaging.providers.ts` (borrado) | Reemplazado por transport |
| `messaging.transport.spec.ts` (nuevo) | Tests del código vivo |
| `post-scheduler.service.ts` | Usa `QueueManager` central (elimina BullMQ duplicado) |
| `baileys.session.ts` | `sendMedia` reusa `toJid` |
| `lib/connection-status.ts` (nuevo) | Labels+colores de estado centralizados |
| `lib/cloudinary.ts` (nuevo) | `uploadToCloudinary` (dedup) |
| `lib/utils.ts` | `relativeTime` + `formatDateTime` |
| status-dot / connection-dialog / conexiones / historial / whatsapp-panel / use-domain-mutations | Consumen los helpers centralizados |
| backend-notice / form-dialog / configure-services / app-providers / http-adapters | `NEXT_PUBLIC_API_URL` → `VITE_API_URL` |
