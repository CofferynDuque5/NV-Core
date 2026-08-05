# NV Core — Funcionalidades completas

> Documento de referencia. Describe **qué tiene NV Core** módulo por módulo, más
> la **conexión de WhatsApp que ya se logró en NSAP** y que fue integrada al
> backend de NV Core.

---

## 1. Qué es NV Core (arquitectura)

Plataforma **multi-workspace** (multi-empresa) con un mismo "Core" de módulos
compartido. Monorepo con dos aplicaciones:

- **`apps/api`** — Backend **NestJS + Prisma (PostgreSQL) + Redis**. Es donde
  vive toda la lógica: auth, WhatsApp, campañas, IA, billing, etc.
- **`apps/web`** — Frontend **React + Vite (SPA)** con **react-router**. Sin
  SSR/SSG: `build` genera un `dist/` estático que sirve Nginx/Apache. Se
  comunica con el backend solo por **REST + Socket.IO** (sin lógica de negocio
  en el frontend).
- **`packages/domain`** — Configuración estructural compartida (workspaces,
  módulos, canales, roles) y los **contratos de servicio** que consume la web.

### Patrón Provider + Adapter (backend)

Todo canal externo pasa por un **ProviderManager** central; el resto del
sistema nunca llama a una API externa directamente. Cada proveedor expone
adapters intercambiables con una **interfaz común** (`connect`, `disconnect`,
`authenticate`, `refreshCredentials`, `publish`, `sendMessage`, `sendMedia`,
`healthCheck`, `getStatus`):

- **WhatsAppProvider** → BaileysAdapter · CloudAPIAdapter
- **FacebookProvider** / **InstagramProvider** → MetaGraphAdapter · BrowserAutomationAdapter
- **EmailProvider** → ResendAdapter
- **TikTokProvider** → OfficialApiAdapter

El **adapter activo se elige por workspace** en el módulo **Conexiones** y se
persiste (`ProviderSelection`). Cambiar de proveedor no toca el resto del
código. **ProviderManager es el único punto de entrada a cualquier proveedor
externo**: ni CampaignRunner, ni el envío de mensajería, ni la publicación
social tocan una API externa directamente — todo pasa por él.

### Infraestructura núcleo (desacoplamiento y asíncrono)

- **Event Bus interno** (`CoreModule`): los módulos se comunican publicando
  **eventos de dominio** (`message.received`, `campaign.completed`,
  `provider.published`, `job.failed`…) en vez de importarse entre sí.
- **Queue Manager** (BullMQ + Redis, con fallback en-línea sin Redis):
  procesamiento asíncrono de trabajos.
- **Job Manager**: administra **estados** (queued → active → completed | failed),
  **reintentos** con backoff y **fallos**, persistidos en Postgres (`Job`);
  incluye API para inspeccionar y reintentar jobs.

### n8n como orquestador principal

La dirección está **invertida**: el backend ya no controla n8n. En su lugar:

- El **Event Bus reenvía los eventos de dominio a n8n** (`N8N_EVENTS_WEBHOOK`).
- n8n decide y **llama de vuelta al backend** en `POST /api/automation/actions/*`
  (`send-message`, `publish`, `run-campaign`), autenticado con
  `N8N_INBOUND_SECRET`. Cada acción se despacha como **Job** y sale por el
  **ProviderManager**, que actualiza PostgreSQL con el resultado.

### Los 14 workspaces (empresas)
Un Ciclo Creativo, Un Código Creativo, El Pulso de Naturaleza, Design Your Core,
Perla Tour, VAROUDUVA STORE, Software Studio, Marketing Studio, AI Automation
Studio, Fitness, Password Vault, Women's Health, NV Streaming, NV Stream.

Cada workspace tiene su marca (color de acento, iniciales, tagline) y, por
defecto, **acceso a todos los módulos del Core**. La URL sigue el patrón
`/w/<workspace>/<módulo>` (ej. `/w/perla-tour/inbox`).

### Canales de comunicación soportados (config)
WhatsApp, Instagram, Facebook, TikTok, Telegram, X, Threads y Email — cada uno
con su color de marca.

### Roles (RBAC)
`owner`, `admin`, `editor`, `viewer` — controlan qué puede hacer cada miembro
dentro de un workspace.

---

## 2. Módulos del panel (18 secciones)

La navegación lateral está agrupada así:

### PRINCIPAL
| Módulo | Qué hace |
|---|---|
| **Dashboard** | Resumen operativo del workspace (métricas y estado general). |
| **Calendario** | Planificación visual de publicaciones y envíos programados. |
| **Campañas** | Operaciones de marketing: crear, lanzar, pausar/reanudar campañas. |

### AUDIENCIA
| Módulo | Qué hace |
|---|---|
| **Contactos** | CRM / base de audiencia. |
| **Grupos** | Grupos de difusión (incluye los **grupos de WhatsApp sincronizados**). |
| **Segmentos** | Audiencias dinámicas (filtros sobre contactos). |

### MENSAJERÍA
| Módulo | Qué hace |
|---|---|
| **Inbox** | Conversaciones unificadas de todos los canales; enruta mensajes entrantes (webhooks) al proveedor correcto. |

### CREACIÓN
| Módulo | Qué hace |
|---|---|
| **Campaign Builder** | Editor visual de contenido de campañas. |
| **AI Content Studio** | Generación de contenido con IA. |
| **Plantillas** | Mensajes reutilizables con **variables** (`{{clave}}`). |
| **Biblioteca** | Gestor de medios (imágenes/archivos). |

### AUTOMATIZACIÓN
| Módulo | Qué hace |
|---|---|
| **Automatizaciones** | Flujos sin código, integrados con **n8n** vía REST/Webhooks. |
| **Analytics** | Business Intelligence / métricas. |

### SISTEMA
| Módulo | Qué hace |
|---|---|
| **Marketplace** | Catálogo de integraciones. |
| **Conexiones** | Proveedores y OAuth — **aquí se conecta WhatsApp** (QR), Meta, Google, etc. |
| **Configuración** | Equipo, roles y ajustes del sistema. |

---

## 3. Capacidades del backend (implementadas)

Estos servicios ya están construidos en `apps/api/src/modules`:

- **Autenticación**: registro/login con JWT + refresh tokens, **reset de
  contraseña** y **verificación de email**, gestión de miembros y roles.
- **IA (multi-proveedor)**: OpenAI / Anthropic / Gemini, con **metering de uso
  por workspace** (contabiliza consumo).
- **WhatsApp (Baileys)**: conexión por QR por workspace (ver sección 4).
- **Mensajería**: envío por WhatsApp/Telegram; **webhooks entrantes** que caen
  en el Inbox.
- **Redes sociales (Meta Graph API)**: servicio para publicar en Facebook/Instagram.
- **Campañas + Scheduler**: ejecutor real de campañas (`campaign-runner`) y
  programador de publicaciones (`post-scheduler`), con **worker de colas**.
- **Billing (Stripe)**: suscripciones, **webhook de Stripe** que sincroniza el
  estado del plan, y **gating de módulos por plan**.
- **Media (Cloudinary)**: subidas firmadas.
- **Integraciones (Google OAuth)**: conexión de cuentas Google.
- **Automatizaciones (n8n)**: el backend manda trabajos y recibe el resultado
  por callback.
- **Seguridad/robustez**: **cifrado de tokens en reposo**, **rate limiting**,
  **observabilidad** (request-id, errores, Sentry opcional) y **auditoría**
  (AuditLog).

### Modelo de datos (Prisma) — entidades principales
User, AuthToken, RefreshToken, Membership, Contact, **Group**, GroupVariable,
Segment, Campaign, CampaignTarget, SendLog, Post, Connection, MediaFolder,
MediaAsset, Template, Automation, CalendarEvent, Conversation, Message,
Notification, AuditLog, Workspace, GoogleConnection, **WhatsappSession**,
AiUsage, BillingAccount.

---

## 4. Conexión de WhatsApp — lo que se logró en NSAP (e integrado a NV Core)

Esta es la funcionalidad que **ya funcionó en NSAP** (entrar al panel y conectar
WhatsApp por QR) y que se portó al backend de NV Core.

### Cómo funciona
- Usa **Baileys** (`@whiskeysockets/baileys`) — la librería de WhatsApp Web. **No
  requiere API oficial de Meta ni número de empresa**: se conecta como WhatsApp
  Web escaneando un **código QR**.
- El **QR se muestra en el panel en tiempo real** vía **Socket.IO** (evento
  `wa:status` / QR como imagen `data:URL`). Escaneas con tu teléfono
  (WhatsApp → Dispositivos vinculados) y queda conectado.
- La **sesión se persiste en disco** (`useMultiFileAuthState`). Si reinicias el
  servidor, **reconecta solo** sin volver a escanear el QR.
- **Reconexión automática** ante caídas transitorias; si se cierra sesión real
  (logout), borra credenciales y pide QR nuevo.

### Estados de conexión
`disconnected` → `connecting` → `qr` → `connected`.

### Qué hace una vez conectado
- Detecta y guarda el **número** conectado y la fecha de última conexión.
- **Sincroniza los grupos** de WhatsApp (nombre + nº de miembros) y los guarda
  para poder usarlos como destino de campañas (`groupFetchAllParticipating`).
- Cuenta **contactos** conocidos.
- **Enviar mensajes**: texto a un número, o **a un grupo por su JID**, con
  soporte de **adjuntos** (imagen como foto, video, o documento con caption).

### API de WhatsApp (endpoints)
- `GET /status` — estado actual (conectado/nº/grupos/contactos).
- `POST /connect` — inicia conexión (genera el QR).
- `POST /reconnect` — reconecta.
- `POST /disconnect` — cierra sesión.
- `POST /sync` — vuelve a sincronizar grupos/contactos.

### Diferencia NSAP vs NV Core
- En **NSAP** la conexión es **single-tenant** (una sola cuenta de WhatsApp para
  toda la app) — es lo más simple y es lo que ya te funcionó.
- En **NV Core** es **multi-workspace**: cada empresa (`workspaceSlug`) tiene su
  propia sesión de WhatsApp independiente, con su propio QR y sus propios grupos,
  persistidos en la tabla `WhatsappSession` y `Group` de PostgreSQL.

---

## 5. Funciones extra que NSAP ya tenía (referencia)

NSAP, además de la conexión de WhatsApp, incluía:

- **Login multiusuario con roles** (admin / editor / viewer).
- **Plantillas** de mensaje + **variables por grupo** (`{{grupo}}`, `{{fecha}}`,
  `{{hora}}` y claves personalizadas).
- **Campañas a grupos** con **programación**: una vez, **diaria** y **semanal**.
- **Adjuntos** (imagen/archivo) en campañas; **pausar/reanudar**.
- **Historial de envíos** + **exportar a CSV**.
- **Gestor de contenidos** (biblioteca) + **generación con IA** (OpenAI/
  Anthropic/Gemini) + recomendaciones IA (mejores horarios, mejorar mensaje).
- **n8n** (workflows por REST/Webhook).
- **Facebook / Instagram (Meta Graph API)**: publicación real de foto/video,
  **Reels**, **Historias**, **carrusel** (2–10), con **insights/métricas**.

Estas capacidades fueron la base de los módulos equivalentes en NV Core
(Campañas, Plantillas, Biblioteca, AI Content Studio, Automatizaciones, Social).
