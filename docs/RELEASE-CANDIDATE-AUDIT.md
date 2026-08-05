# NV Core — Release Candidate Audit

> Auditoría integral en modo Release Candidate (roles: CEO, CTO, PM, Arquitecto,
> UX/UI, QA, Performance, Security, DevOps, A11y, SRE, Tech Writer). Regla: no se
> asume que algo está bien porque funciona; el estándar es **SaaS comercial
> premium**. Fecha: 2026-08-05.

## Veredicto (Fase 11): 🔴 **NO publicar todavía**

El producto tiene **una** experiencia de nivel premium (Calendario Inteligente,
recién terminado S1–S5) sobre una **base técnica sólida y congelada**
(ProviderManager, EventBus, QueueManager, JobManager, patrón Provider+Adapter,
seguridad base). Pero **la mayor parte del roadmap no está a nivel producto** y
**faltan por completo las piezas de adopción** (onboarding, ayuda, changelog,
página de estado, backups, import/export). Publicarlo como "SaaS premium" hoy
sería faltar a la verdad. Se **bloquea el release** y se entrega el backlog
priorizado.

---

## Fase 1 — Feature complete (roadmap)

| Fase | Módulo | Estado | Nota |
|---|---|---|---|
| 1 | **Calendario Inteligente** | ✅ Completo (premium) | 5 vistas, DnD + undo, conflictos, mejor horario, panel operativo. |
| 2 | **Campaign Builder** (Canva-like) | 🔴 No cumple | `builder` es una pantalla simple; no hay editor drag&drop con capas/texto/media/QR/historial. |
| 3 | **Media Library** | 🟡 Parcial | Hay carpetas; faltan tags, versionado, compresión, miniaturas, metadatos, uso por campaña. |
| 4 | **Workflow Builder** | 🔴 No cumple | `automatizaciones` solo dispara webhooks n8n; falta el editor visual de nodos (el usuario aún necesitaría n8n). |
| 5 | **AI Content Studio** | 🟡 Parcial | Generación básica; faltan reescritura/traducción/variantes/optimización a nivel producto. |
| 6 | **Analytics** | 🟡 Parcial | Métricas básicas; faltan embudos, heatmaps, conversiones, comparativas. |
| 7 | **Inbox Omnicanal** | 🟡 Funcional | Conversaciones + envío; falta asignación/etiquetas/omnicanal completo. |
| 8 | **CRM** | 🟡 Funcional | Contactos/grupos/segmentos básicos; faltan embudos, actividad, automatizaciones. |
| 9 | **Marketplace** | 🔴 No cumple | Catálogo visual; no instala providers/adapters/plugins reales. |

**Conclusión Fase 1:** solo la Fase 1 del roadmap está *feature-complete a nivel
premium*. No se implementan aquí (RC no crea features); se listan como bloqueantes.

---

## Fase 2 — Product audit (1–10; se exige ≥ 9.5)

| Módulo | Nota | Motivo principal |
|---|---:|---|
| Calendario | 9.0 | Lo más pulido; falta QA real en dispositivos, virtualización a gran escala y paridad de teclado en DnD. |
| Conexiones | 8.5 | Hub WhatsApp + selector de adapters sólido; falta feedback de estado en vivo. |
| Configuración | 8.0 | Equipo + billing correctos. |
| Inbox | 7.5 | Funcional; sin asignación/etiquetas. |
| Campañas | 7.5 | Funcional; UX no premium. |
| Dashboard | 7.5 | Resumen correcto; no es BI ejecutivo. |
| AI Studio | 7.0 | Generación básica. |
| CRM (Contactos/Grupos/Segmentos) | 7.0 | Básico. |
| Analytics | 6.5 | Sin embudos/heatmaps/conversiones. |
| Media Library | 6.0 | Solo carpetas. |
| Marketplace | 5.0 | Sin instalación real. |
| Campaign Builder | 4.0 | No es un editor. |
| Workflow Builder | 4.0 | Sin editor de nodos. |

**Ninguno alcanza 9.5** → todos requieren trabajo antes del release (regla del
propio RC). El de mayor nota (Calendario) es el patrón de calidad a replicar.

---

## Fase 3 — UX audit (experiencia)
- **Fortalezas:** Calendario con <3s de contexto, atajos, panel operativo sin
  cambiar de vista, undo, estados vacíos/carga/error consistentes, a11y básica.
- **Riesgos:** el resto de módulos no comparte ese nivel (más clics, menos
  feedback). Falta **onboarding** para el primer uso (hoy el usuario entra a un
  panel vacío sin guía). Falta **tour contextual** por módulo y microcopy guía.

## Fase 4 — Code audit
- **Deuda baja:** sin `TODO/FIXME` reales; dead-code y duplicación ya depurados
  en la auditoría previa (`docs/AUDITORIA-ARQUITECTURA.md`). Módulos cohesivos.
- **Pendiente:** algunos módulos "gordos" de un archivo (aceptado por convención);
  sin bloqueantes de calidad de código.

## Fase 5 — Performance
- **Bien:** rutas con `React.lazy` + code-splitting, gzip en Nginx, colas
  BullMQ/Redis opcionales con fallback inline, Socket.IO solo para WhatsApp.
- **Pendiente (P1):** **virtualización** de listas largas (Inbox/Contactos),
  medición real de TTI/consultas, y presupuesto de bundle (chunk principal
  ~135 kB gzip: aceptable, mejorable).

## Fase 6 — Security
- **Bien:** JWT + refresh (cookie httpOnly), guards de roles + workspace,
  `ValidationPipe` con `whitelist` + `forbidNonWhitelisted` (anti mass-assignment),
  rate limiting global, **cifrado de secretos en reposo**, CORS restringido a
  orígenes, secreto para el bridge de n8n, Prisma (parametrizado → sin SQLi).
- **Pendiente (P1):** **security headers** (helmet/CSP) no configurados; sin
  pen-test formal; revisión de límites de subida y de logging de datos sensibles.

## Fase 7 — Testing
- **Actual:** API ~98 unit; web 18 unit (lógica de calendario); 4 E2E
  (auth, calendar, crud, inbox).
- **Pendiente (P1):** cobertura E2E por módulo, pruebas de **carga/estrés**
  (colas, Socket.IO), y de regresión ampliada.

## Fase 8 — Accessibility
- **Bien:** roles/aria en Calendario, foco visible, color + etiqueta (no solo
  color), labels en formularios.
- **Pendiente (P1):** auditoría **WCAG** formal, contraste verificado en ambos
  temas, y **DnD accesible por teclado** completo (hoy mitigado con los botones
  de "mover" del panel).

## Fase 9 — Product polish
- Calendario pulido. El resto necesita el mismo pase de pulido (feedback,
  estados, microcopy, iconografía, espaciados) una vez alcancen el nivel premium.

## Fase 10 — Documentación
- **Existe:** `SETUP.md`, `COMO_VERLO.md`, `docs/AUDITORIA-ARQUITECTURA.md`,
  `docs/NV-CORE-FUNCIONALIDADES.md`.
- **Pendiente (P1/P2):** ADRs (decisiones ya tomadas: Vite, Provider+Adapter,
  EventBus/Queue/Job, n8n orquestador), **runbook de deployment**, referencia
  completa de variables de entorno, diagramas de arquitectura.

---

## Backlog priorizado para el Release (orden del plan acordado)

### P0 — Feature-complete del roadmap (a nivel premium, replicando Calendario)
1. **Workflow Builder** (Fase 4): editor visual de nodos que sincroniza con n8n.
2. **Campaign Builder** (Fase 2): editor drag&drop (capas/texto/media/preview).
3. **Media Library** (Fase 3): tags, versionado, búsqueda, miniaturas, metadatos.
4. **Analytics** (Fase 6): embudos, conversiones, comparativas, KPIs.
5. **AI Studio / Inbox / CRM / Marketplace**: subir a nivel premium.

### P1 — Piezas de adopción (release readiness) — **ninguna existe hoy**
6. **Onboarding interactivo** (recorrido guiado, datos de ejemplo opcionales, checklist inicial).
7. **Centro de ayuda con búsqueda** + **base de conocimientos** (admin/usuario).
8. **Tour contextual** por módulo.
9. **Sistema de feedback** ("Enviar sugerencia" / "Reportar problema").
10. **Changelog** visible desde el panel.
11. **Página de estado** de integraciones (WhatsApp/Meta/Email/n8n).
12. **Backups y restauración** (datos críticos).
13. **Import/Export** (contactos, campañas, plantillas).

### P1 — Hardening detectado por el RC
14. **Security headers** (helmet + CSP).
15. **Virtualización** de listas largas (Inbox/Contactos).
16. **A11y**: auditoría WCAG + DnD por teclado + contraste.
17. **Testing**: E2E por módulo + carga/estrés.

### P2 — DevOps / Docs
18. Runbook de **deployment**, referencia de **variables**, **ADRs** y diagramas.
19. Smoke real end-to-end contra backend+DB en el entorno objetivo.

---

## ¿Publicarías este producto a clientes reales? **NO.**
Motivo: 1 de 9 fases del roadmap a nivel premium, 0 de 8 piezas de adopción, y
hardening de seguridad/perf/a11y/testing pendiente. Recomendación: ejecutar el
backlog P0→P1→P2 y re-auditar. La base está lista; el producto aún no.
