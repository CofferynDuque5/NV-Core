# NV Core — Guía de instalación paso a paso

Todo lo que necesitas para correrlo en tu máquina: **qué instalar, qué comandos
ejecutar, qué valores/URLs poner y de dónde sacarlos.**

> ¿Solo quieres verlo sin instalar nada? Abre la carpeta **`static-preview/`** en
> VS Code → clic derecho en `index.html` → **Open with Live Server**. Eso es una
> demo estática (sin backend, con estados vacíos). Para el producto real con
> login y datos, sigue esta guía.

---

## 0. Requisitos (instalar una vez)

| Software | Versión | De dónde sacarlo |
|---|---|---|
| **Node.js** | 20 o superior | https://nodejs.org (instalador oficial) |
| **pnpm** | 9+ | Con Node ya instalado: `npm install -g pnpm` · doc: https://pnpm.io |
| **PostgreSQL** | 14+ | https://www.postgresql.org/download/ · en Mac también https://postgresapp.com · o con Docker (ver abajo) |

Comprobar que están:

```bash
node -v      # v20.x o superior
pnpm -v      # 9.x o superior
psql --version
```

---

## ⚡ Atajo con Docker (todo en un comando)

Si tienes **Docker**, puedes saltarte los pasos manuales:

```bash
cp .env.docker.example .env      # opcional; cambia JWT_SECRET
docker compose up --build
```

Levanta **PostgreSQL + Redis + API + Web**, aplica migraciones y queda listo en
**http://localhost:3000** (API en **http://localhost:4000/api**). Parar con
`docker compose down` (`-v` también borra la base de datos).

Si prefieres el modo manual (o no usas Docker), sigue los pasos siguientes.

---

## 1. Instalar dependencias del proyecto

Desde la raíz del proyecto (donde está `package.json`):

```bash
pnpm install
```

> El paquete compartido `@nv/domain` se compila **automáticamente** al instalar
> y al arrancar (`dev`/`build`). Si alguna vez ves errores
> `Cannot find module '@nv/domain'`, compílalo a mano una vez:
> ```bash
> pnpm --filter @nv/domain build
> ```

---

## 2. Base de datos PostgreSQL

Necesitas **una base de datos** y **un usuario**. Elige UNA opción.

### Opción 2A — PostgreSQL instalado en tu máquina

```bash
# crea el usuario 'nvcore' con contraseña 'nvcore' y la base 'nvcore'
psql -U postgres -c "CREATE ROLE nvcore LOGIN PASSWORD 'nvcore';"
psql -U postgres -c "CREATE DATABASE nvcore OWNER nvcore;"
```

> `postgres` es el superusuario por defecto. Si te pide contraseña es la que
> pusiste al instalar PostgreSQL. En Windows usa el "SQL Shell (psql)".

### Opción 2B — PostgreSQL con Docker (si tienes Docker)

```bash
docker run --name nvcore-db -e POSTGRES_USER=nvcore -e POSTGRES_PASSWORD=nvcore \
  -e POSTGRES_DB=nvcore -p 5432:5432 -d postgres:16
```

En ambos casos, tu **cadena de conexión** (la usarás en el paso 3) es:

```
postgresql://nvcore:nvcore@localhost:5432/nvcore?schema=public
```

De dónde sale cada parte:
`postgresql://` **usuario**`nvcore` : **contraseña**`nvcore` @ **host**`localhost` : **puerto**`5432` / **base**`nvcore`.
Si cambiaste usuario/contraseña/puerto, ajústalos aquí.

---

## 3. Configurar el backend (`apps/api/.env`)

Crea el archivo `apps/api/.env` (puedes copiar `apps/api/.env.example`):

```bash
cp apps/api/.env.example apps/api/.env
```

Edita `apps/api/.env` y pon **estos 4 valores mínimos**:

```bash
NODE_ENV=development
PORT=4000
CORS_ORIGINS=http://localhost:3000
JWT_SECRET=PEGA_AQUI_UN_SECRETO_LARGO
DATABASE_URL=postgresql://nvcore:nvcore@localhost:5432/nvcore?schema=public
```

**Qué poner y de dónde sale cada uno:**

| Variable | Qué poner | De dónde sale |
|---|---|---|
| `PORT` | `4000` | Puerto donde correrá la API. Puedes dejarlo así. |
| `CORS_ORIGINS` | `http://localhost:3000` | La **URL del frontend**. Es la que abrirás en el navegador (paso 6). Debe coincidir con el puerto del frontend. |
| `JWT_SECRET` | una cadena aleatoria larga | **Genérala tú** con el comando de abajo. No la compartas. |
| `DATABASE_URL` | la cadena del paso 2 | Tu conexión a PostgreSQL. |

Generar un `JWT_SECRET` seguro (copia el resultado y pégalo):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# o, en Mac/Linux:  openssl rand -hex 32
```

> El resto de variables del `.env.example` (OpenAI, WhatsApp, Stripe…) son
> **opcionales**: la app arranca y funciona sin ellas. Ver la sección final.

---

## 4. Crear las tablas (Prisma)

```bash
pnpm --filter @nv/api prisma:generate     # genera el cliente Prisma
pnpm --filter @nv/api prisma:migrate      # crea las tablas en tu BD
```

Para inspeccionar la BD visualmente (opcional):

```bash
pnpm --filter @nv/api prisma:studio       # abre http://localhost:5555
```

---

## 5. Arrancar el backend (NestJS)

En una terminal:

```bash
pnpm --filter @nv/api dev
```

- API: **http://localhost:4000/api**
- Documentación (Swagger): **http://localhost:4000/api/docs**
- Salud: **http://localhost:4000/api/health** (debe decir `"database":"configured"`)

Déjala corriendo.

---

## 6. Configurar y arrancar el frontend (Next.js)

Crea `apps/web/.env.local` con **una sola variable**: la URL del backend.

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > apps/web/.env.local
```

| Variable | Qué poner | De dónde sale |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | La **URL del backend** del paso 5 (host:puerto de la API, sin `/api`). |

En **otra** terminal:

```bash
pnpm --filter @nv/web dev
```

- App: **http://localhost:3000**

> Si NO pones `NEXT_PUBLIC_API_URL`, la web corre en **modo demo** (sin login,
> con estados vacíos). Con la variable, te pedirá iniciar sesión.

---

## 7. Probar el flujo completo

1. Abre **http://localhost:3000** → te lleva a **Crear cuenta**.
2. Rellena nombre, email y contraseña; en **"Workspace a reclamar"** elige uno
   (te conviertes en **Owner** de ese workspace).
3. Entra a **Contactos → Nuevo** y crea un contacto: aparece en la tabla y se
   guarda en PostgreSQL. Igual en Campañas, Segmentos, Grupos, Plantillas.
4. **Conexiones**: pulsa *Conectar* en un canal y guarda credenciales de prueba.
5. **Automatizaciones**: *Nuevo flujo*.
6. **Configuración → Equipo**: invita a otro usuario (debe registrarse primero),
   cámbiale el rol o quítalo. Cada acción queda en **Configuración → Logs**.

---

## Resumen de puertos y URLs

| Qué | URL |
|---|---|
| Frontend (lo que abres) | http://localhost:3000 |
| Backend API | http://localhost:4000/api |
| Swagger (API docs) | http://localhost:4000/api/docs |
| Prisma Studio (opcional) | http://localhost:5555 |
| PostgreSQL | localhost:5432 |

Variables que tú defines:
- `apps/api/.env` → `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS=http://localhost:3000`
- `apps/web/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:4000`

---

## Comandos útiles

```bash
pnpm build        # compila todo el monorepo (domain + web + api)
pnpm typecheck    # chequeo de tipos (TypeScript estricto)
pnpm --filter @nv/api dev     # solo backend
pnpm --filter @nv/web dev     # solo frontend

# regenerar la vista estática (static-preview/)
cd apps/web && STATIC_EXPORT=true pnpm build
```

---

## Integraciones (TODAS opcionales)

No hacen falta para usar la app. Cuando quieras conectarlas, añade su clave en
`apps/api/.env` y reinicia el backend. El **Marketplace** muestra en tiempo real
cuáles están conectadas (badge «Conectado») según las claves configuradas.

**Ya cableadas y funcionales:**

- **IA (AI Content Studio)** → configura **una** de `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY` o `GEMINI_API_KEY`. Con varias, el API usa `AI_PROVIDER`
  (o el orden de prioridad `anthropic → openai → gemini`). Modelos ajustables
  con `OPENAI_MODEL` / `ANTHROPIC_MODEL` / `GEMINI_MODEL`. Sin ninguna, la
  pantalla muestra su estado vacío y el endpoint responde 503.
- **Email (Resend)** → con `RESEND_API_KEY` (y opcional `MAIL_FROM`), invitar a
  un miembro envía un email de notificación (best-effort; nunca bloquea la acción).
- **Mensajería (WhatsApp / Telegram)** → con `WHATSAPP_TOKEN` +
  `WHATSAPP_PHONE_NUMBER_ID` o `TELEGRAM_BOT_TOKEN`, las respuestas del Inbox se
  entregan al destinatario (si la conversación tiene teléfono/chat id). Best-effort:
  el mensaje siempre se guarda aunque falle el envío externo.
- **Pagos (Stripe)** → con `STRIPE_SECRET_KEY` (+ `STRIPE_PRICE_ID` para el precio
  por defecto), Configuración → Facturación habilita checkout de suscripción y el
  portal de cliente de Stripe. Sin clave, la pestaña muestra su estado vacío.
- **Media (Cloudinary)** → con `CLOUDINARY_URL`, Biblioteca sube archivos
  directo del navegador a Cloudinary (subida firmada por el backend) y registra
  el asset. Sin clave, el botón avisa que falta configurar Cloudinary.
- **Google (OAuth)** → con `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` y
  `APP_URL`/`API_URL` correctos, Conexiones muestra «Conectar con Google»
  (Calendar/Drive). Autoriza en Google Console el redirect
  `{API_URL}/api/integrations/google/callback`.
- **Automatización (n8n)** → una automatización puede guardar un webhook de n8n
  (URL absoluta, o un path si defines `N8N_BASE_URL`). El botón «Ejecutar» en
  Automatizaciones llama a ese webhook y suma una ejecución. `N8N_API_KEY` se
  envía como cabecera si está definido.

De dónde sacar cada clave:

| Variable(s) | Servicio | De dónde |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI | https://platform.openai.com/api-keys |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | https://console.anthropic.com → API Keys |
| `GEMINI_API_KEY` | Google Gemini | https://aistudio.google.com/apikey |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `META_APP_ID`, `META_APP_SECRET` | WhatsApp Business / Meta | https://developers.facebook.com → tu App → WhatsApp |
| `TELEGRAM_BOT_TOKEN` | Telegram | Habla con **@BotFather** en Telegram → `/newbot` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google APIs | https://console.cloud.google.com → APIs & Services → Credentials |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe | https://dashboard.stripe.com → Developers → API keys / Webhooks |
| `CLOUDINARY_URL` | Cloudinary | https://console.cloudinary.com (Dashboard → API Environment variable) |
| `RESEND_API_KEY` | Resend (email) | https://resend.com/api-keys |
| `REDIS_URL` | Redis | Local (`redis://localhost:6379`) o https://upstash.com |
| `N8N_BASE_URL`, `N8N_API_KEY` | n8n (automatización) | Tu instancia de https://n8n.io |

---

## Problemas comunes

- **`Can't reach database server at localhost:5432`** → PostgreSQL no está
  corriendo. Arráncalo (servicio del sistema, Postgres.app, o el contenedor
  Docker del paso 2B) y reinicia el backend.
- **La web dice error de CORS** → `CORS_ORIGINS` en `apps/api/.env` debe ser
  exactamente la URL del frontend (`http://localhost:3000`). Reinicia el backend
  tras cambiarlo.
- **Al invitar un miembro sale "debe registrarse primero"** → ese email aún no
  tiene cuenta. Regístralo primero desde `/register`.
- **`JWT_SECRET es obligatorio en producción`** → define `JWT_SECRET` en el
  `.env` (paso 3).
