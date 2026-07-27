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

**Publicación real (Graph API).** Cuando esté configurado:
- **Facebook**: texto, **foto** o **video** en la Página. Los videos se publican
  como **Reel** con **subida resumable por chunks** (apto para archivos grandes:
  el archivo se lee del disco por trozos y se sube a la API de Reels de FB).
- **Instagram**: **feed** (imagen o video), **Reel** (video), **Historia**
  (imagen/video) y **carrusel** (2–10 elementos). Los videos se procesan de forma
  asíncrona (NSAP hace polling hasta que estén listos y luego publica).
- IG **exige URLs públicas**: las imágenes/videos se sirven en
  `${APP_URL}/media/<archivo>`, así que **`APP_URL` debe ser accesible desde
  internet** (dominio público o túnel tipo ngrok; `localhost` no sirve para IG).
- **Vista previa**: en *Publicar ahora* pulsa «Vista previa» para ver texto +
  media + destinos + formato antes de publicar.
- Publica desde **Conexiones → Publicar ahora**, o marca Facebook/Instagram como
  destinos de una **campaña** (el scheduler publica al dispararse). En la campaña
  eliges el **formato** (feed/reel/historia/carrusel) y puedes **adjuntar varios
  archivos** (carrusel).
- Endpoint: `POST /api/social/publish { targets, message, attachment, attachments, format }`
  (`format`: `feed` | `reel` | `story` | `carousel`).

**Métricas / insights (Graph API).** En **Historial**, cada publicación de
FB/IG muestra un botón 📈 que abre sus métricas (me gusta, comentarios,
compartidos/guardados, alcance, impresiones, reproducciones de Reel…).
- Endpoint: `GET /api/social/insights?target=facebook|instagram&id=<postId>`.
  El `postId` se guarda en el historial al publicar.
- El conjunto de métricas depende del tipo de media y de los permisos de tu app;
  las que la API no devuelva se omiten (degradación sin errores).

**n8n dispara publicaciones.** Importa `examples/n8n-publish-workflow.json` en n8n.
Define en n8n las variables `NSAP_URL` y `NSAP_API_TOKEN`. En NSAP, define
`NSAP_API_TOKEN` (token de máquina): las peticiones con la cabecera
`x-api-token: <token>` se autentican sin cookie. El workflow llama a
`POST {NSAP_URL}/api/social/publish` en el horario que definas.

## Conectar n8n
- `N8N_WEBHOOK_URL` (webhook del workflow) **o** `N8N_BASE_URL` (+ `workflow` en el
  dispatch). Opcional: `N8N_API_KEY`, `N8N_CALLBACK_TOKEN` (protege el callback).
- El callback público es `POST {APP_URL}/api/n8n/callback?token=...` con `{jobId, result}`.

## IA
Define **una** clave: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` o `GEMINI_API_KEY`
(opcional `AI_PROVIDER`). Sin clave, el botón «IA» avisa que no está configurada.

## Uso

### Rápido (con script)
```bash
cd nsap
cp .env.example .env   # opcional: edítalo para FB/IG/IA/n8n
./start.sh             # instala deps si faltan, carga .env y arranca en --watch
```
Otros modos: `./start.sh prod` (sin watch) · `./start.sh test`.

### Manual (npm)
```bash
cd nsap
npm install
npm run dev            # o: npm start
```
`npm run dev`/`npm start` cargan automáticamente `.env` si existe
(`--env-file-if-exists`; requiere Node 20.12+). También puedes pasar las
variables a mano: `PORT=4000 FB_PAGE_ID=... npm run dev`.

Abre **http://localhost:4000**.

> **Configuración**: copia `.env.example` a `.env` y rellena solo lo que
> necesites. Todo es opcional — sin claves la app arranca igual y cada función
> que requiera una integración avisa en vez de romperse. `.env` está en
> `.gitignore` (nunca se sube).

### Docker
```bash
cd nsap
cp .env.example .env          # opcional
docker compose up -d --build  # construye y levanta NSAP + n8n
docker compose logs -f        # ver logs (aquí aparece el estado/QR por consola)
docker compose down           # parar (los datos se conservan)
```
- **NSAP** → http://localhost:4000 (login inicial `admin` / `admin`). Cambia el
  puerto del host con `PORT=8080 docker compose up -d`.
- Los datos (sesión de WhatsApp, `db.json`, uploads) se guardan en el volumen
  `nsap-data`, así que sobreviven a `down`/`up` y a reinicios.
- Requiere Docker Compose v2.24+ (por `env_file` opcional). Sin compose:
  `docker build -t nsap . && docker run -d -p 4000:4000 --env-file .env -v nsap-data:/app/data nsap`.
- Para **Instagram**, `APP_URL` debe ser pública también en Docker (túnel o dominio).

#### n8n incluido
El compose levanta también **n8n** (solo ejecuta workflows; NSAP le envía
trabajos y recibe el resultado por callback):
- **n8n** → http://localhost:5678 (login `N8N_USER` / `N8N_PASSWORD` del `.env`).
- Ambos comparten red interna: NSAP alcanza n8n en `http://n8n:5678`
  (`N8N_BASE_URL` ya viene apuntado ahí) y n8n alcanza NSAP en `http://nsap:4000`.
- Dentro de n8n, los nodos HTTP ya tienen `NSAP_URL=http://nsap:4000` y
  `NSAP_API_TOKEN` (si lo definiste): importa `examples/n8n-publish-workflow.json`
  y funcionará sin tocar URLs.
- Solo NSAP (sin n8n): `docker compose up -d --build nsap`.

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
