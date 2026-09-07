# Desplegar NV Core en un hosting

## Por qué ves un "Index of /" (listado de archivos)

NV Core **no es una web estática de un solo archivo**: es un monorepo con dos
piezas separadas:

1. **Web (front)** — una SPA de React/Vite. Se _compila_ a archivos estáticos
   (`apps/web/dist`) que sí puedes subir a cualquier hosting.
2. **API (backend) + PostgreSQL** — un servidor Node (NestJS). Necesita ejecutarse
   en un servicio que corra Node y una base de datos (no en un hosting estático).

Si subes el **repositorio** (las carpetas `apps/`, `packages/`, `scripts/`…) a un
hosting Apache, este solo muestra la lista de archivos ("Index of /") porque no hay
un `index.html` en la raíz ni nadie que compile el proyecto. La solución es subir
**solo el front ya compilado**, y publicar la API aparte.

---

## Opción A — Recomendada: Render en un clic (todo funcionando, una sola URL)

El repo trae un **Blueprint de Render** (`render.yaml`) que crea automáticamente
la base de datos PostgreSQL, un Redis y **un único servicio web** donde la API
**también sirve la web** en la misma URL. Al ser el mismo origen, no hay CORS ni
problemas de cookies: todo funciona de una.

Pasos (una sola vez):

1. Sube este repo a **GitHub** (tu rama ya se publica ahí).
2. Entra a <https://dashboard.render.com> → **New +** → **Blueprint**.
3. Conecta este repositorio y elige la rama. Render lee `render.yaml`, crea la BD,
   el Redis y el servicio web, y hace el primer deploy (tarda unos minutos la
   primera vez porque compila la imagen Docker).
4. Cuando termine, tendrás una URL tipo `https://nv-core.onrender.com` con **todo
   funcionando**: login, workspaces, campañas, WhatsApp/Telegram, inbox, biblioteca.

`JWT_SECRET` y `ENCRYPTION_KEY` los genera Render solo. `DATABASE_URL` y
`REDIS_URL` se conectan automáticamente. **No tienes que configurar nada más** para
el núcleo.

### Integraciones opcionales (cuando las tengas)

En el panel de Render → tu servicio → **Environment**, rellena solo las que uses y
pulsa **Save** (redepliega solo):

- `IMGBB_API_KEY` — imágenes (recomendado). `CLOUDINARY_URL` — si quieres video.
- `TELEGRAM_API_ID` + `TELEGRAM_API_HASH` — cuenta de Telegram (my.telegram.org).
- `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`) — cobros.
- `META_APP_ID` + `META_APP_SECRET` / `WHATSAPP_TOKEN` — Facebook/Instagram/WA Cloud.
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — IA de contenido.
- `RESEND_API_KEY` — envío de correos (invitaciones).
- `APP_URL` y `API_URL` — pon la URL de Render (p.ej. `https://nv-core.onrender.com`)
  en ambas **solo si** vas a usar callbacks de Meta/Google/Stripe.

### Notas importantes del plan gratis

- Los servicios **free se duermen** tras ~15 min de inactividad y **la BD gratis
  caduca a los ~90 días**. Para uso real (y para que WhatsApp siga conectado 24/7)
  sube el servicio a **Starter** y la BD a un plan de pago.
- **Sesiones de WhatsApp/Telegram**: se guardan en disco y el disco del plan free
  es efímero (se borra en cada deploy/reinicio), así que tras un reinicio tendrás
  que volver a escanear el QR. Para que persistan, añade un **Disk** de Render
  (planes de pago) montado en `/data` y define
  `WHATSAPP_SESSION_DIR=/data/whatsapp` y `TELEGRAM_SESSION_DIR=/data/telegram`.

### Alternativa: Docker en tu propio servidor/VPS

El repo también trae `docker-compose.yml` + `apps/api/Dockerfile` y
`apps/web/Dockerfile` (dos servicios). Define las variables de `apps/api/.env.example`,
construye la web con `VITE_API_URL=https://api.tudominio.com` y arranca con
`docker compose up -d --build`.

---

## Opción B — Hosting compartido (cPanel/Apache) solo para el front

Sirve si ya tienes la **API publicada en otro sitio** (Opción A para la API, o un
VPS) y solo quieres el front en tu hosting compartido.

1. En tu equipo, dentro del proyecto, compila el front apuntando a tu API:

   ```bash
   pnpm install
   pnpm desplegar:web https://api.tudominio.com
   ```

   Esto genera la carpeta **`apps/web/dist`** con todo listo (incluye un
   `.htaccess` para que las rutas de la SPA funcionen en Apache).

2. Sube **el CONTENIDO** de `apps/web/dist` (el `index.html`, la carpeta
   `assets/`, el `.htaccess`, los iconos…) a la raíz de tu hosting (normalmente
   `public_html`). **No** subas la carpeta `dist` en sí, ni el repositorio.

3. Si tu panel oculta los archivos que empiezan por punto, activa "mostrar
   ocultos" para subir también el **`.htaccess`** (o créalo desde el panel con el
   contenido de `apps/web/public/.htaccess`). Sin él, las rutas profundas darán 404.

### ¿Y si solo quiero ver la interfaz (demo)?

```bash
pnpm desplegar:web
```

Sin URL de API, el build queda en **modo demo**: la interfaz se ve y se puede
navegar, pero **no hay login ni datos reales** (usa adaptadores vacíos). Útil para
enseñar el diseño; para uso real necesitas la API (Opción A).

---

## Errores frecuentes

- **"Index of /"** → subiste el repositorio. Sube solo `apps/web/dist` (Opción B)
  o usa Docker (Opción A).
- **Pantalla en blanco / rutas que dan 404 al recargar** → falta el `.htaccess`
  (Opción B, paso 3), o el hosting está en un subdirectorio (entonces necesitas
  ajustar `base` en `apps/web/vite.config.ts`).
- **La web carga pero no hay login ni datos** → se compiló sin `VITE_API_URL`
  (modo demo) o la API no es accesible desde el navegador. Reconstruye con la URL
  pública correcta de tu API.
