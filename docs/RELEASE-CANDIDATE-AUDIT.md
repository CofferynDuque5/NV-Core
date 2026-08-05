# NV Core — Release Candidate Audit (v2)

> Auditoría integral en modo Release Candidate (roles: CEO, CTO, PM, Arquitecto,
> UX/UI, QA, Performance, Security, DevOps, A11y, SRE, Tech Writer). Regla: no se
> asume que algo está bien porque funciona; el estándar es **SaaS comercial
> premium**. Re-ejecución tras Calendario S1–S5 + Media Library premium.

## Veredicto (Fase 11): 🔴 **NO publicar todavía**

Avance real desde la v1: hay **dos** módulos a nivel premium (Calendario y Media
Library) sobre una base técnica sólida y con **higiene de código verificada**.
Pero **7 de 9 fases del roadmap siguen sin estar a nivel producto** y **no existe
ninguna pieza de adopción** (onboarding, ayuda, changelog, estado, backups,
import/export). Se mantiene el **bloqueo de release** y se entrega el backlog
actualizado.

---

## Fase 1 — Feature complete (roadmap)

| Fase | Módulo | Estado | Cambio vs v1 |
|---|---|---|---|
| 1 | Calendario Inteligente | ✅ Premium | = |
| 3 | **Media Library** | ✅ Premium (baseline) | 🟡→✅ búsqueda, carpetas, etiquetas, edición. *Falta versionado/compresión (P2).* |
| 2 | Campaign Builder | 🔴 No cumple | = |
| 4 | Workflow Builder | 🔴 No cumple | = |
| 5 | AI Content Studio | 🟡 Parcial | = |
| 6 | Analytics | 🟡 Parcial | = |
| 7 | Inbox Omnicanal | 🟡 Funcional | = |
| 8 | CRM | 🟡 Funcional | = |
| 9 | Marketplace | 🔴 No cumple | = |

---

## Fase 2 — Product audit (1–10; se exige ≥ 9.5)

| Módulo | v1 | v2 | Motivo |
|---|---:|---:|---|
| Calendario | 9.0 | 9.0 | Falta QA en dispositivos, virtualización, DnD por teclado. |
| Conexiones | 8.5 | 8.5 | Sólido; sin feedback de estado en vivo. |
| **Media Library** | 6.0 | **8.5** | Búsqueda/carpetas/etiquetas/edición; falta versionado/uso-por-campaña. |
| Configuración | 8.0 | 8.0 | — |
| Inbox | 7.5 | 7.5 | Sin asignación/etiquetas. |
| Campañas | 7.5 | 7.5 | — |
| Dashboard | 7.5 | 7.5 | No es BI ejecutivo. |
| AI Studio | 7.0 | 7.0 | Generación básica. |
| CRM | 7.0 | 7.0 | Básico. |
| Analytics | 6.5 | 6.5 | Sin embudos/heatmaps/conversiones. |
| Marketplace | 5.0 | 5.0 | Sin instalación real. |
| Campaign Builder | 4.0 | 4.0 | No es un editor. |
| Workflow Builder | 4.0 | 4.0 | Sin editor de nodos. |

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
- 🔴 **Pendiente (P1):** **security headers ausentes** (helmet/CSP/HSTS); sin
  pen-test formal; revisión de límites de subida y logging de datos sensibles.

## Fase 7 — Testing (verificado, verde)
- ✅ **API: 102 unit** (23 files) · **Web: 18 unit** · **4 E2E** (auth, calendar,
  crud, inbox).
- ⏳ **Pendiente (P1):** E2E por módulo, **carga/estrés** (colas, Socket.IO),
  regresión ampliada.

## Fase 8 — Accessibility
- ✅ Roles/aria en Calendario, color + etiqueta (no solo color), labels en forms,
  `aria-label` en búsqueda/acciones de la Biblioteca.
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
1. Analytics (embudos/conversiones/comparativas) — siguiente, se completa dentro del freeze.
2. Workflow Builder (editor estructurado que sincroniza con n8n).
3. Campaign Builder (editor estructurado por capas + preview).
4. AI Studio / Inbox / CRM / Marketplace a nivel premium.

### P1 — Piezas de adopción (ninguna existe)
5. Onboarding interactivo · 6. Centro de ayuda + KB · 7. Tour contextual ·
8. Feedback · 9. Changelog · 10. Página de estado · 11. Backups/restore ·
12. Import/Export (contactos, campañas, plantillas).

### P1 — Hardening detectado por el RC
13. **Security headers (helmet + CSP + HSTS)** · 14. Virtualización de listas ·
15. WCAG + DnD por teclado + contraste · 16. E2E por módulo + carga/estrés.

### P2 — DevOps / Docs
17. Runbook de deployment · referencia de variables · ADRs · diagramas ·
smoke real end-to-end contra backend+DB.

---

## ¿Publicarías este producto a clientes reales? **NO.**
2 de 9 fases premium, 0 de 8 piezas de adopción, y hardening (helmet, WCAG,
carga) pendiente. La base es sólida y limpia; ejecutar P0→P1→P2 y re-auditar.
