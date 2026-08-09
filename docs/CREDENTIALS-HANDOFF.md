# Handoff de credenciales — activar integraciones reales

Guía operativa para el propietario. NV Core **arranca y funciona sin ninguna
credencial** (adapters vacíos / modo demo); cada integración es **opcional** y se
activa poniendo sus variables de entorno en el backend (`apps/api`) y
reiniciando. Este documento dice, por integración: **qué necesitas**, **dónde
obtenerlo**, **dónde ponerlo** y **cómo verificar** que quedó activo.

> ⚠️ **Nunca** se comitea ningún secreto. Pon los valores en tu gestor de secretos
> / variables del entorno de despliegue, no en el repo. La plantilla de
> referencia es [`apps/api/.env.example`](../apps/api/.env.example).

## Cómo verificar (herramientas comunes)

- **Arranque**: si una variable obligatoria falta o es inválida, la API **no
  arranca** y escribe el motivo (`Invalid environment configuration: …`).
- **Salud**: `GET {API_URL}/api/health` (liveness), `GET /api/health/ready`
  (readiness: DB + Redis), `GET /api/health/status` (estado por componente).
- **Estado de integraciones** (el verificador principal): autentícate y llama
  `GET {API_URL}/api/workspaces/<slug>/integrations`. Cada entrada trae
  `connected: true|false` derivado de la config **real** — si pusiste bien las
  claves, la integración aparece `connected: true`. En la UI es la página
  **Conexiones / Marketplace**.

Para las pruebas de abajo se asume que ya tienes login (usuario/clave del panel)
y el `slug` de tu workspace (p. ej. `codigo-creativo`).

---

## 0. Núcleo (obligatorio en producción)

| Variable | Para qué | Cómo obtenerlo |
|---|---|---|
| `JWT_SECRET` | Firma de tokens de sesión | Cadena aleatoria ≥ 32 chars (`openssl rand -base64 48`) |
| `ENCRYPTION_KEY` | Cifra secretos en reposo (tokens OAuth, etc.) | Cadena aleatoria ≥ 32 chars distinta de la anterior |
| `DATABASE_URL` | PostgreSQL | Cadena `postgresql://user:pass@host:5432/db?schema=public` |
| `APP_URL` / `API_URL` | Construyen enlaces de correo y redirects OAuth | Las URLs públicas del frontend y del backend |
| `CORS_ORIGINS` | Orígenes permitidos | Lista separada por comas con el origen del frontend |

**Verificar**: la API arranca sin errores; `GET /api/health/ready` → `{"status":"ok","database":"ok"}`; puedes iniciar sesión. Aplica migraciones con `pnpm --filter @nv/api exec prisma migrate deploy`.

---

## 1. Proveedor de IA (AI Content Studio, recomendaciones, hashtags)

Configura **al menos uno**. Si hay varios, se usa `AI_PROVIDER`; si no, el orden
de prioridad es `anthropic → openai → gemini`.

| Variable | Cómo obtenerlo |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `OPENAI_API_KEY` | platform.openai.com → API Keys |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key |
| `AI_PROVIDER` *(opcional)* | `openai` \| `anthropic` \| `gemini` |
| `AI_MONTHLY_QUOTA` *(opcional)* | Tope mensual de llamadas por workspace (0/vacío = ilimitado) |
| `*_MODEL` *(opcional)* | Sobrescribe el modelo por proveedor |

**Verificar**: `…/integrations` muestra la IA `connected: true`; en **AI Studio**
genera variantes → devuelve texto real (no demo) y el contador de uso
(`…/ai/usage`) sube.

> **Imágenes con IA — pendiente de esta fase.** Anthropic (proveedor por defecto)
> no tiene API de imágenes; requiere una key de OpenAI/Gemini con capacidad de
> imagen. Cuando quieras activarlo, es un módulo aparte (método de imagen del
> proveedor + modelo en config + dimensión de metering + ruta/DTO/throttle +
> almacenamiento en Cloudinary + UI). Avísame con la key disponible y lo construyo.

---

## 2. Email transaccional (Resend)

Envía invitaciones de equipo, verificación de email y restablecimiento de
contraseña (usan `APP_URL` para los enlaces).

| Variable | Cómo obtenerlo |
|---|---|
| `RESEND_API_KEY` | resend.com → API Keys |
| `MAIL_FROM` | Remitente verificado (p. ej. `NV Core <no-reply@tudominio.com>`). Verifica tu dominio en Resend primero. |

**Verificar**: dispara "olvidé mi contraseña" para un usuario real → llega el
correo; el enlace abre `APP_URL/reset-password`. Sin la key, estos flujos siguen
existiendo pero no envían correo.

---

## 3. WhatsApp + Meta (Facebook / Instagram)

Dos caminos de WhatsApp, independientes:

**(a) WhatsApp Cloud API (oficial, Meta)** — salientes + entrantes por webhook.

| Variable | Cómo obtenerlo |
|---|---|
| `WHATSAPP_TOKEN` | Meta for Developers → tu app → WhatsApp → token permanente |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup → Phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | Cadena que tú inventas; la pones aquí y en la config del webhook |
| `META_APP_ID` / `META_APP_SECRET` | Configuración → Básica de la app en Meta |
| `INBOUND_WORKSPACE` | `slug` del workspace que recibe los mensajes entrantes |

Registra el webhook en Meta apuntando a
`{API_URL}/api/integrations/whatsapp/webhook` con el mismo `WHATSAPP_VERIFY_TOKEN`.

**(b) WhatsApp por Baileys (QR, no oficial)** — escaneas un QR desde el panel.

| Variable | Para qué |
|---|---|
| `WHATSAPP_SESSION_DIR` | Carpeta donde se guarda la sesión (por workspace). Default `data/whatsapp`. |

**Verificar**: (a) el GET de verificación del webhook de Meta devuelve el
`hub.challenge` (Meta marca el webhook como verificado); envía un mensaje entrante
de prueba → aparece en **Inbox** del `INBOUND_WORKSPACE`. `…/integrations`
muestra WhatsApp/Meta `connected: true`. (b) En **Conexiones** el panel de
WhatsApp muestra el QR; al escanearlo pasa a `connected`.

---

## 4. Telegram

| Variable | Cómo obtenerlo |
|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` |
| `TELEGRAM_WEBHOOK_SECRET` | Cadena que inventas; Telegram la reenvía como cabecera secreta |
| `INBOUND_WORKSPACE` | (compartido con WhatsApp) workspace de entrada |

Registra el webhook: `setWebhook` → `{API_URL}/api/integrations/telegram/webhook`
con el `secret_token`.

**Verificar**: escribe a tu bot → el mensaje entra en **Inbox**. Peticiones sin
la cabecera secreta correcta se rechazan (fail-closed).

---

## 5. Google (Calendar / Drive vía OAuth)

| Variable | Cómo obtenerlo |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web) |

Autoriza el redirect URI **exacto**:
`{API_URL}/api/integrations/google/callback`.

**Verificar**: en **Conexiones** pulsa "Conectar Google" → completa el consentimiento
→ vuelve como `connected`. El token se guarda **cifrado** (usa `ENCRYPTION_KEY`).

---

## 6. Pagos (Stripe)

| Variable | Cómo obtenerlo |
|---|---|
| `STRIPE_SECRET_KEY` | dashboard.stripe.com → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Al crear el endpoint de webhook (abajo), copia el "Signing secret" |
| `STRIPE_PRICE_ID` | Precio de suscripción por defecto para el checkout |
| `DEFAULT_PLAN` *(opcional)* | Plan cuando Stripe no está configurado (`free`/`pro`) |

Crea el endpoint de webhook en Stripe apuntando a
`{API_URL}/api/integrations/stripe/webhook` (eventos de suscripción).

**Verificar**: **Configuración → Facturación** → "Suscribirse" abre el checkout de
Stripe; tras pagar en modo test, el webhook sincroniza la suscripción y el plan
del workspace cambia. El portal de cliente abre desde el mismo lugar.

---

## 7. Media (Cloudinary)

| Variable | Cómo obtenerlo |
|---|---|
| `CLOUDINARY_URL` | cloudinary.com → Dashboard → "API Environment variable" (`cloudinary://key:secret@cloud`) |

**Verificar**: en **Biblioteca** sube una imagen → se sirve desde `res.cloudinary.com`.
Sin la variable, la subida avisa "Cloudinary no está configurado".

---

## 8. Automatización (n8n) y colas (Redis) — opcionales

| Variable | Para qué |
|---|---|
| `N8N_BASE_URL` / `N8N_API_KEY` | "Ejecutar" en Automatizaciones llama a webhooks de n8n |
| `N8N_EVENTS_WEBHOOK` | Reenvía eventos de dominio a n8n |
| `N8N_INBOUND_SECRET` | Secreto que n8n debe enviar (`X-N8N-Secret`) para llamar acciones del backend |
| `REDIS_URL` | Activa el worker BullMQ que publica posts/campañas programadas en su fecha. Sin él, funciona en modo *inline*. |
| `SENTRY_DSN` | Reporta errores 5xx a Sentry (si no, no-op) |
| `METRICS_TOKEN` | Bearer que protege `GET /api/metrics` (scrape Prometheus) |

**Verificar**: `…/integrations` muestra n8n `connected` con `N8N_BASE_URL`;
`GET /api/health/ready` reporta `redis: "ok"` (vs `inline`) cuando hay `REDIS_URL`.

---

## Resumen de webhooks a registrar

| Servicio | URL a registrar |
|---|---|
| WhatsApp Cloud API | `{API_URL}/api/integrations/whatsapp/webhook` |
| Telegram (`setWebhook`) | `{API_URL}/api/integrations/telegram/webhook` |
| Google OAuth (redirect URI) | `{API_URL}/api/integrations/google/callback` |
| Stripe | `{API_URL}/api/integrations/stripe/webhook` |

## Qué queda pendiente de mí (desarrollo)

Todo lo anterior ya está **construido y probado**; solo requiere tus credenciales
para activarse en vivo. Lo único que implica **código nuevo** es:

- **Generación de imágenes con IA** (§1): pendiente de una key con capacidad de
  imagen (OpenAI/Gemini). En cuanto la tengas, lo implemento end-to-end.
