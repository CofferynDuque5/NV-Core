# NV Core — Guía rápida (tokens, uso gratis, página de ventas y conexiones)

Esta guía responde a lo esencial para dejar tu plataforma lista y venderla.

---

## 1) Cómo usar tu propio software GRATIS

Tú eres el dueño del servidor, así que **no le pagas a nadie**: los planes de
precios son para **tus clientes**, no para ti.

- Si **no** configuras Stripe (pagos), NV Core pone a todos en el plan **Pro**
  por defecto — sin límites de uso. Es el modo pensado para el auto-hospedaje.
- Puedes forzarlo con la variable de entorno `DEFAULT_PLAN=pro` (es el valor por
  defecto). Ponla en `free` solo si quieres limitar deliberadamente.
- Tu cuenta de administrador se crea sola al arrancar con las variables
  `NV_ADMIN_EMAIL` y `NV_ADMIN_PASSWORD`. Con ella eres **Owner** de tus
  workspaces y tienes acceso completo.

En resumen: **self-host + sin Stripe = todo desbloqueado, gratis, para ti.**

---

## 2) Poner tus tokens/claves DESDE LA APP (sin tocar el servidor)

Ya no hace falta editar variables de entorno en el hosting. Entra a
**Integraciones** (menú lateral) y pulsa **Configurar** en la tarjeta que
quieras. Se abre una ventana para **pegar tu clave**; se guarda **cifrada** en
tu cuenta y la tarjeta pasa a "Conectada".

Disponibles hoy con entrada de token en la app:

| Integración | Qué pegar | Dónde conseguirlo |
|---|---|---|
| **OpenAI** | API Key (`sk-…`) | platform.openai.com |
| **Anthropic** | API Key (`sk-ant-…`) | console.anthropic.com |
| **Google Gemini** | API Key (`AIza…`) | aistudio.google.com |
| **Telegram** | **API ID** y **API Hash** | my.telegram.org → API development tools |
| **ImgBB** (imágenes) | API Key | api.imgbb.com |

> La clave que pegues manda sobre la del servidor. Si algún día defines también
> la variable de entorno, la de la app sigue teniendo prioridad.

Después de guardar tu **API ID/Hash de Telegram**, ve a **Conexiones → Telegram**
y pulsa **Conectar** para escanear el QR con tu cuenta.

---

## 3) Que WhatsApp y Telegram NO se desconecten en el hosting

NV Core ahora se **auto-reconecta**:

- Cada pocos minutos un "vigilante" revisa las sesiones y **vuelve a levantar**
  las que se cayeron, sin pedirte un QR nuevo (mientras la cuenta siga
  vinculada). También se reconecta solo cuando el hosting reinicia el proceso.

Para que sea aún más estable en un hosting compartido (cPanel/Passenger), evita
que el proceso "se duerma" por inactividad:

- En **Setup Node.js App**, si tu plan lo permite, mantén la app siempre viva
  (algunos paneles tienen una opción de "always on" / `PassengerMinInstances 1`).
- O usa un **ping externo gratuito** (p. ej. UptimeRobot) a
  `https://TU-DOMINIO/api/health` cada 5 minutos. Eso mantiene el servidor
  despierto y, por tanto, las sesiones conectadas.

---

## 4) Tu página de ventas (sitio web profesional)

Está lista en **`sitio/index.html`** (un solo archivo, sin dependencias).

**Cómo publicarla:**

1. Sube `sitio/index.html` a tu hosting (por ejemplo a `public_html/` como
   `index.html`, o a un subdominio como `www.tudominio.com`).
2. Abre el archivo y cambia el enlace del botón **"Abrir NV Core"**: busca
   `id="app-link"` y pon la URL real de tu aplicación (donde corre NV Core).
3. Los **precios son editables**: busca los `data-monthly` / `data-annual` en la
   sección de precios y ajústalos a lo que quieras cobrar.

La página **no menciona** todavía la conexión con redes sociales, tal como
pediste: habla de campañas, CRM, automatizaciones, contenido con IA, plantillas,
biblioteca y analítica.

---

## 5) Instalar la app en teléfono y computadora (descarga)

NV Core es una **PWA**: se instala como una app, sin tiendas.

- **En el teléfono:** abre tu NV Core en el navegador → menú → **"Añadir a
  pantalla de inicio"** / **"Instalar app"**.
- **En la computadora (Chrome/Edge):** abre NV Core → icono de **instalar** en la
  barra de direcciones → **Instalar**.
- Una vez instalada, abre a pantalla completa y funciona aunque haya cortes de
  red (el shell queda cacheado).

---

## Resumen de variables útiles (opcionales, servidor)

Solo si prefieres el servidor en vez de la app:

```
DEFAULT_PLAN=pro            # todo desbloqueado en self-host (por defecto)
NV_ADMIN_EMAIL=tucorreo     # crea tu cuenta Owner al arrancar
NV_ADMIN_PASSWORD=...       # contraseña de esa cuenta
OPENAI_API_KEY=...          # o pégala en Integraciones
TELEGRAM_API_ID=...         # o pégalos en Integraciones → Telegram
TELEGRAM_API_HASH=...
IMGBB_API_KEY=...           # o pégala en Integraciones → ImgBB
```
