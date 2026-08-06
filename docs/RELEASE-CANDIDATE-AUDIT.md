# NV Core — Release Candidate Audit (v2)

> Auditoría integral en modo Release Candidate (roles: CEO, CTO, PM, Arquitecto,
> UX/UI, QA, Performance, Security, DevOps, A11y, SRE, Tech Writer). Regla: no se
> asume que algo está bien porque funciona; el estándar es **SaaS comercial
> premium**. Re-ejecución tras Calendario S1–S5 + Media Library premium.

## Veredicto (Fase 11): 🔴 **NO publicar todavía**

Avance real desde la v1: hay **siete** módulos a nivel premium (Calendario, Media
Library, Analytics, Workflow Builder, Campaign Builder, Inbox Omnicanal y CRM)
sobre una base técnica sólida y con **higiene de código verificada**. Pero **2 de
9 fases del roadmap siguen sin estar a nivel producto** (AI Studio y Marketplace)
y **no existe ninguna pieza de adopción** (onboarding, ayuda, changelog, estado,
backups, import/export). Se mantiene el **bloqueo de release** y se entrega el
backlog actualizado.

---

## Fase 1 — Feature complete (roadmap)

| Fase | Módulo | Estado | Cambio vs v1 |
|---|---|---|---|
| 1 | Calendario Inteligente | ✅ Premium | = |
| 3 | **Media Library** | ✅ Premium (baseline) | 🟡→✅ búsqueda, carpetas, etiquetas, edición. *Falta versionado/compresión (P2).* |
| 2 | **Campaign Builder** | ✅ Premium (baseline) | 🔴→✅ editor visual por capas (texto/precio/botón/etiqueta/imagen/fondo), arrastre+redimensión, z-order, inspector, formatos y export SVG/PNG; diseños reutilizables. *Falta plantillas prediseñadas y multi-selección (P2).* |
| 4 | **Workflow Builder** | ✅ Premium (baseline) | 🔴→✅ editor visual de nodos (disparador/acción/espera/condición), conexiones, inspector, validación y guardado; sincroniza con la orquestación (n8n oculto). *Falta ramas por condición y test-run (P2).* |
| 5 | AI Content Studio | 🟡 Parcial | = |
| 6 | **Analytics** | ✅ Premium (baseline) | 🟡→✅ período 7/30/90, KPIs con delta vs período anterior, serie temporal, embudo CRM, tasas de conversión y **heatmap de actividad**. *Falta cohortes/exportación (P2).* |
| 7 | **Inbox Omnicanal** | ✅ Premium (baseline) | 🟡→✅ asignación por responsable, etiquetas de triage, filtros (búsqueda/canal/estado/responsable). *Falta notas internas y snippets (P2).* |
| 8 | **CRM** | ✅ Premium (baseline) | 🟡→✅ pipeline kanban con arrastre entre etapas, ficha con actividad/notas, filtros y vista tabla↔pipeline. *Falta campos personalizados y tareas (P2).* |
| 9 | Marketplace | 🔴 No cumple | = |

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
| AI Studio | 7.0 | 7.0 | Generación básica. |
| CRM | 7.0 | **9.0** | Pipeline kanban con DnD, ficha con notas/actividad, filtros y doble vista. Falta campos personalizados. |
| Analytics | 6.5 | **8.5** | Período comparativo, deltas, serie temporal, embudo, conversión y heatmap. Falta cohortes/exportación. |
| Marketplace | 5.0 | 5.0 | Sin instalación real. |
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
- 🔴 **Pendiente (P1):** pen-test formal; revisión de límites de subida y
  logging de datos sensibles.

## Fase 7 — Testing (verificado, verde)
- ✅ **API: 108 unit** (24 files, incl. **6 de carga/estrés** del core async) ·
  **Web: 18 unit** · **7 E2E** (auth, calendar, crud, inbox, **campaigns,
  media, route-smoke**).
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
4. ✅ **Inbox** (asignación + etiquetas + filtros) — HECHO. · ✅ **CRM** (pipeline kanban + notas + filtros) — HECHO. · AI Studio / Marketplace a nivel premium.

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

## ¿Publicarías este producto a clientes reales? **NO.**
7 de 9 fases premium, 0 de 8 piezas de adopción, y hardening (WCAG, carga real)
pendiente. La base es sólida y limpia; ejecutar P0→P1→P2 y re-auditar.
