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

## Opción A — Recomendada: todo el stack (web + API + BD)

La forma más simple de tener NV Core funcionando de verdad (login, envíos,
campañas, inbox) es un servicio que ejecute contenedores Docker. El repo ya trae
todo lo necesario:

- `docker-compose.yml` — levanta PostgreSQL + API + Web.
- `apps/api/Dockerfile` y `apps/web/Dockerfile`.

Pasos generales (VPS propio, Render, Railway, Fly.io, etc.):

1. Sube el repositorio a tu servidor/servicio (o conéctalo a tu repo de GitHub).
2. Define las variables de entorno de la API (ver `apps/api/.env.example`):
   `DATABASE_URL`, `JWT_SECRET`, y las claves que uses (ImgBB, Stripe, Telegram…).
3. Construye la web apuntando a la URL pública de tu API:
   `VITE_API_URL=https://api.tudominio.com`
4. Arranca: `docker compose up -d --build`.

La web quedará servida por Nginx (ver `apps/web/nginx.conf`, que ya hace el
fallback de rutas de la SPA) y la API en su propio contenedor contra Postgres.

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
