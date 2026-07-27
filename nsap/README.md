# NSAP — Automatización de WhatsApp

Aplicación **autocontenida**: backend **Node.js + Express** y frontend **HTML +
CSS + JavaScript vanilla + Bootstrap**. Sin Next.js, sin frameworks de frontend.
Conexión a WhatsApp con **Baileys**, QR mostrado en el panel en tiempo real
(Socket.IO), sesión persistida en disco, y **campañas programadas a grupos**.

## Requisitos
- Node.js 20+

## Novedades
- **Login multiusuario con roles** (admin / editor / viewer); admin gestiona usuarios.
- **Plantillas de mensaje** reutilizables.
- **Variables por grupo** (personalización): `{{clave}}` se reemplaza por grupo.
  Integradas: `{{grupo}}`, `{{fecha}}`, `{{hora}}`.
- **Historial de envíos** + **exportar a CSV**.
- **Programación**: una vez, **diaria** y **semanal** (días de la semana).
- **Adjuntos** (imagen/archivo) en las campañas.
- **Gestor de contenidos** (biblioteca de texto/media) y **generación con IA**
  (OpenAI/Anthropic/Gemini).
- **n8n** vía REST/Webhooks: el backend envía trabajos y recibe el resultado por
  callback (n8n solo ejecuta workflows).
- **Facebook / Instagram**: panel de estado + guía de qué configurar (Meta Graph API).
- **Pausar / reanudar** campañas.

## Conectar Facebook / Instagram
Define en el entorno del servidor (y reinicia). El panel → **Conexiones** mostrará
las tarjetas en verde cuando estén completas:
- `META_APP_ID`, `META_APP_SECRET` — tu app en developers.facebook.com.
- `FB_PAGE_ID`, `FB_PAGE_TOKEN` — Página de Facebook + token de Página (permisos
  `pages_manage_posts`, `pages_read_engagement`; usa un token de larga duración).
- `IG_BUSINESS_ID`, `IG_ACCESS_TOKEN` — cuenta de Instagram Business vinculada a la
  Página (`instagram_basic`, `instagram_content_publish`).

## Conectar n8n
- `N8N_WEBHOOK_URL` (webhook del workflow) **o** `N8N_BASE_URL` (+ `workflow` en el
  dispatch). Opcional: `N8N_API_KEY`, `N8N_CALLBACK_TOKEN` (protege el callback).
- El callback público es `POST {APP_URL}/api/n8n/callback?token=...` con `{jobId, result}`.

## IA
Define **una** clave: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` o `GEMINI_API_KEY`
(opcional `AI_PROVIDER`). Sin clave, el botón «IA» avisa que no está configurada.

## Uso

```bash
cd nsap
npm install
npm run dev        # o: npm start
```

Abre **http://localhost:4000**.

### Primera vez
1. Pestaña **Conexión** → **Conectar**.
2. Aparece el **QR** en el panel → escanéalo desde WhatsApp → *Dispositivos vinculados*.
3. El estado cambia a 🟢 **Conectado**. La sesión se guarda en `data/session/`.
4. No vuelve a pedir QR: al reiniciar el servidor reconecta solo. Si la sesión
   expira, el panel muestra un QR nuevo automáticamente.

### Grupos
Al conectar se sincronizan los grupos. La pestaña **Grupos** los lista; puedes
volver a **Sincronizar** cuando quieras.

### Campañas → grupos (con Scheduler)
En **Campañas** creas una campaña con: mensaje, **grupos objetivo** (checkbox) y
**programación**:
- **Una vez**: fecha y hora concretas.
- **Diaria**: se envía cada día a la hora indicada (ej. 08:00).

El scheduler evalúa las campañas cada 30 s y, cuando corresponde, envía el
mensaje a cada grupo (con un retardo configurable entre grupos para evitar
bloqueos) y registra el resultado. También puedes **Enviar ahora**.

## Almacenamiento
Todo se guarda en archivos dentro de `data/` (sin base de datos externa):
- `data/session/` — credenciales de WhatsApp (Baileys). **No lo compartas.**
- `data/db.json` — grupos, campañas y logs de envío.

## Variables de entorno (opcionales)
| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `4000` | Puerto del servidor |
| `NSAP_DATA_DIR` | `data` | Carpeta de datos (db.json) |
| `NSAP_SESSION_DIR` | `data/session` | Carpeta de la sesión de WhatsApp |
| `NSAP_GROUP_DELAY_MS` | `4000` | Retardo entre grupos al enviar |
| `NSAP_USERNAME` | `admin` | Usuario del panel |
| `NSAP_PASSWORD` | `admin` | Contraseña del panel |
| `NSAP_SECRET` | (dev) | Secreto para firmar la sesión (defínelo en producción) |

## APIs (todas dentro del proyecto)
- `POST /api/auth/{login,logout}`, `GET /api/auth/me`
- `GET/POST /api/whatsapp/{status,connect,reconnect,disconnect,sync}`
- `GET /api/groups`, `POST /api/groups/sync`, `GET/PUT /api/groups/:id/vars`
- `GET/POST /api/campaigns`, `DELETE /api/campaigns/:id`, `POST /api/campaigns/:id/{run,pause,resume}`
- `GET/POST /api/templates`, `DELETE /api/templates/:id`
- `GET /api/logs` (historial de envíos)

Todas las rutas (salvo `login`/`logout`) requieren sesión.

## Tests
```bash
npm test
```
