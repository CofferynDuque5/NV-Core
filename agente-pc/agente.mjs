/**
 * NV Agente PC — publica en Facebook e Instagram desde TU computadora, con tu
 * propio inicio de sesión (nada de apps de Meta ni servicios externos).
 *
 *   node agente.mjs login    → abre un navegador para que inicies sesión (una vez)
 *   node agente.mjs run      → queda abierto: cada minuto publica lo que el panel tenga en cola
 *   node agente.mjs probar   → comprueba la conexión con el panel y las sesiones guardadas
 *
 * El perfil del navegador (cookies) se guarda en ./perfil. La configuración en
 * ./config.json. Las capturas de los errores en ./errores.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";

const HERE = resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const CONFIG = join(HERE, "config.json");
const PERFIL = join(HERE, "perfil");
const ERRORES = join(HERE, "errores");
const SIMULAR = process.env.NV_AGENTE_SIMULAR === "1"; // pruebas sin navegador

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

// ── Configuración ──────────────────────────────────────────────────────────
async function cargarConfig() {
  if (existsSync(CONFIG)) return JSON.parse(readFileSync(CONFIG, "utf8"));
  const rl = createInterface({ input: stdin, output: stdout });
  console.log("\nPrimera vez: dime cómo entrar a tu panel NV Marketing.\n");
  const panelUrl = (await rl.question("URL del panel (ej. https://nvmarketingpanel.nvcorx.com): ")).trim().replace(/\/+$/, "");
  const email = (await rl.question("Tu email del panel: ")).trim();
  const password = (await rl.question("Tu contraseña del panel: ")).trim();
  const workspace = (await rl.question("Workspace (lo que va después de /w/ en la URL, ej. nv-streaming-2): ")).trim();
  rl.close();
  const cfg = { panelUrl, email, password, workspace, intervaloSegundos: 60 };
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
  console.log(`Guardado en ${CONFIG}\n`);
  return cfg;
}

// ── API del panel ──────────────────────────────────────────────────────────
class Panel {
  constructor(cfg) {
    this.cfg = cfg;
    this.token = null;
  }
  async login() {
    const r = await fetch(`${this.cfg.panelUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: this.cfg.email, password: this.cfg.password }),
    });
    if (!r.ok) throw new Error(`No pude entrar al panel (${r.status}). Revisa email/contraseña en config.json.`);
    const j = await r.json();
    this.token = j.accessToken || j.token;
    if (!this.token) throw new Error("El panel no devolvió token.");
  }
  async call(method, path, body) {
    if (!this.token) await this.login();
    const go = () =>
      fetch(`${this.cfg.panelUrl}/api/workspaces/${this.cfg.workspace}/${path}`, {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
    let r = await go();
    if (r.status === 401) {
      await this.login();
      r = await go();
    }
    if (!r.ok) {
      let msg = `${r.status}`;
      try {
        const j = await r.json();
        msg = Array.isArray(j.message) ? j.message.join(" · ") : j.message || msg;
      } catch {}
      throw new Error(`Panel ${method} ${path}: ${msg}`);
    }
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
}

// ── Navegador ──────────────────────────────────────────────────────────────
async function abrirNavegador(headless = false) {
  const { chromium } = await import("playwright");
  mkdirSync(PERFIL, { recursive: true });
  return chromium.launchPersistentContext(PERFIL, {
    headless,
    viewport: { width: 1280, height: 860 },
    locale: "es-ES",
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

async function sesiones(ctx) {
  const cookies = await ctx.cookies(["https://www.facebook.com", "https://www.instagram.com"]);
  return {
    facebook: cookies.some((c) => c.name === "c_user" && c.domain.includes("facebook")),
    instagram: cookies.some((c) => c.name === "sessionid" && c.domain.includes("instagram")),
  };
}

async function descargar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No pude descargar la imagen (${r.status}): ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const ext = extname(new URL(url).pathname) || ".jpg";
  const file = join(tmpdir(), `nv-agente-${Date.now()}${ext}`);
  writeFileSync(file, buf);
  return file;
}

async function captura(page, id) {
  try {
    mkdirSync(ERRORES, { recursive: true });
    const file = join(ERRORES, `${id}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
  } catch {
    return null;
  }
}

/** Primer localizador visible de una lista de candidatos. */
async function primero(page, candidatos, timeout = 15_000) {
  const fin = Date.now() + timeout;
  while (Date.now() < fin) {
    for (const c of candidatos) {
      const loc = typeof c === "string" ? page.locator(c) : c;
      try {
        if ((await loc.count()) > 0 && (await loc.first().isVisible())) return loc.first();
      } catch {}
    }
    await page.waitForTimeout(400);
  }
  return null;
}

// ── Facebook: publicación en el perfil/página que tengas abierta ───────────
async function publicarFacebook(page, post) {
  await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const texto = [post.copy || post.title, ...(post.hashtags || [])].filter(Boolean).join("\n").trim();

  const abrir = await primero(page, [
    page.getByRole("button", { name: /qué estás pensando|what's on your mind|crear publicación|create post/i }),
    'div[role="button"]:has-text("¿Qué estás pensando")',
    'div[role="button"]:has-text("What\'s on your mind")',
  ]);
  if (!abrir) throw new Error("No encontré el cuadro «¿Qué estás pensando?». ¿Sigues con la sesión iniciada?");
  await abrir.click();

  const dialogo = page.locator('div[role="dialog"]').last();
  await dialogo.waitFor({ timeout: 15_000 });

  const imagen = (post.attachments || []).find((a) => a.url && (a.kind ?? "image") === "image");
  if (imagen) {
    const file = await descargar(imagen.url);
    let input = dialogo.locator('input[type="file"]');
    if ((await input.count()) === 0) {
      const boton = await primero(page, [
        dialogo.getByRole("button", { name: /foto|photo|video/i }),
        dialogo.locator('[aria-label*="Foto"], [aria-label*="Photo"]'),
      ]);
      if (boton) await boton.click();
      await page.waitForTimeout(1200);
      input = dialogo.locator('input[type="file"]');
    }
    if ((await input.count()) === 0) throw new Error("No encontré dónde adjuntar la imagen en Facebook.");
    await input.first().setInputFiles(file);
    await page.waitForTimeout(3000);
  }

  const caja = await primero(page, [dialogo.locator('div[role="textbox"]')]);
  if (!caja) throw new Error("No encontré el cuadro de texto de la publicación.");
  await caja.click();
  if (texto) await page.keyboard.type(texto, { delay: 8 });
  await page.waitForTimeout(800);

  const publicar = await primero(page, [
    dialogo.getByRole("button", { name: /^publicar$|^post$|^siguiente$|^next$/i }),
    dialogo.locator('[aria-label="Publicar"], [aria-label="Post"]'),
  ]);
  if (!publicar) throw new Error("No encontré el botón «Publicar».");
  await publicar.click();
  // Algunas cuentas muestran un segundo paso ("Siguiente" → "Publicar").
  const segundo = await primero(page, [dialogo.getByRole("button", { name: /^publicar$|^post$/i })], 4000);
  if (segundo) await segundo.click().catch(() => {});
  await page.waitForTimeout(6000);
  if ((await dialogo.count()) > 0 && (await dialogo.isVisible().catch(() => false))) {
    throw new Error("Facebook no cerró el cuadro de publicación: probablemente no se publicó. Mira la captura.");
  }
  return { url: "https://www.facebook.com/me" };
}

// ── Instagram: publicación en el feed (requiere imagen) ────────────────────
async function publicarInstagram(page, post) {
  const imagen = (post.attachments || []).find((a) => a.url && (a.kind ?? "image") === "image");
  if (!imagen) throw new Error("Instagram requiere una imagen: añade una a la publicación.");
  const file = await descargar(imagen.url);
  const texto = [post.copy || post.title, ...(post.hashtags || [])].filter(Boolean).join("\n").trim();

  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  // Cierra avisos de notificaciones/cookies si aparecen.
  for (const t of [/ahora no|not now/i, /permitir todas|allow all|aceptar/i]) {
    const b = await primero(page, [page.getByRole("button", { name: t })], 1500);
    if (b) await b.click().catch(() => {});
  }

  const crear = await primero(page, [
    page.locator('svg[aria-label="Nueva publicación"], svg[aria-label="New post"], svg[aria-label="Crear"], svg[aria-label="Create"]').locator("xpath=ancestor::a[1] | ancestor::div[@role='button'][1]"),
    page.getByRole("link", { name: /crear|create|nueva publicación|new post/i }),
  ]);
  if (!crear) throw new Error("No encontré el botón «Crear» de Instagram. ¿Sigues con la sesión iniciada?");
  await crear.click();
  await page.waitForTimeout(1500);
  // Menú "Publicación / Historia" en versiones nuevas.
  const opcion = await primero(page, [page.getByText(/^publicación$|^post$/i)], 2500);
  if (opcion) await opcion.click().catch(() => {});

  const dialogo = page.locator('div[role="dialog"]').last();
  await dialogo.waitFor({ timeout: 15_000 });
  const input = dialogo.locator('input[type="file"]');
  if ((await input.count()) === 0) {
    const sel = await primero(page, [dialogo.getByRole("button", { name: /seleccionar|select from computer/i })], 5000);
    if (sel) {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), sel.click()]);
      await chooser.setFiles(file);
    } else throw new Error("No encontré dónde subir la imagen en Instagram.");
  } else {
    await input.first().setInputFiles(file);
  }
  await page.waitForTimeout(3000);

  for (let i = 0; i < 2; i++) {
    const siguiente = await primero(page, [dialogo.getByRole("button", { name: /^siguiente$|^next$/i }), dialogo.getByText(/^siguiente$|^next$/i)], 15_000);
    if (!siguiente) throw new Error("No encontré el botón «Siguiente» en Instagram.");
    await siguiente.click();
    await page.waitForTimeout(1500);
  }

  const caja = await primero(page, [
    dialogo.locator('textarea[aria-label*="pie" i], textarea[aria-label*="caption" i]'),
    dialogo.locator('div[role="textbox"]'),
  ]);
  if (caja && texto) {
    await caja.click();
    await page.keyboard.type(texto, { delay: 8 });
  }

  const compartir = await primero(page, [dialogo.getByRole("button", { name: /^compartir$|^share$/i }), dialogo.getByText(/^compartir$|^share$/i)]);
  if (!compartir) throw new Error("No encontré el botón «Compartir».");
  await compartir.click();
  const ok = await primero(page, [page.getByText(/se ha compartido|se compartió|has been shared|post shared/i)], 45_000);
  if (!ok) throw new Error("Instagram no confirmó la publicación. Mira la captura.");
  return { url: "https://www.instagram.com/" };
}

// ── Bucle principal ────────────────────────────────────────────────────────
async function run() {
  const cfg = await cargarConfig();
  const panel = new Panel(cfg);
  await panel.login();
  log(`Conectado al panel como ${cfg.email} · workspace ${cfg.workspace}`);

  const ctx = SIMULAR ? null : await abrirNavegador(false);
  const page = ctx ? ctx.pages()[0] ?? (await ctx.newPage()) : null;
  const ses = ctx ? await sesiones(ctx) : { facebook: true, instagram: true };
  log(`Sesiones → Facebook: ${ses.facebook ? "sí" : "NO"} · Instagram: ${ses.instagram ? "sí" : "NO"}`);
  if (!ses.facebook && !ses.instagram) log("Ejecuta «INICIAR SESION.bat» para entrar en Facebook/Instagram.");

  const intervalo = Math.max(20, Number(cfg.intervaloSegundos) || 60) * 1000;
  log(`Listo. Reviso la cola cada ${intervalo / 1000}s. Deja esta ventana abierta.`);

  for (;;) {
    try {
      const s = ctx ? await sesiones(ctx) : ses;
      await panel.call("POST", "pc-agent/heartbeat", { hostname: hostname(), facebook: s.facebook, instagram: s.instagram });
      const cola = await panel.call("GET", "pc-agent/queue?limit=3");
      for (const post of cola || []) {
        log(`→ Publicando en ${post.target}: "${post.title}"`);
        let resultado;
        try {
          if (SIMULAR) resultado = { url: "simulado" };
          else if (post.target === "facebook") {
            if (!s.facebook) throw new Error("Sin sesión de Facebook en este PC (INICIAR SESION.bat).");
            resultado = await publicarFacebook(page, post);
          } else {
            if (!s.instagram) throw new Error("Sin sesión de Instagram en este PC (INICIAR SESION.bat).");
            resultado = await publicarInstagram(page, post);
          }
          await panel.call("POST", "pc-agent/result", { postId: post.id, ok: true, url: resultado?.url });
          log(`   ✔ publicado`);
        } catch (err) {
          const shot = page ? await captura(page, post.id) : null;
          const error = `${err.message}${shot ? ` (captura: ${shot})` : ""}`;
          await panel.call("POST", "pc-agent/result", { postId: post.id, ok: false, error }).catch(() => {});
          log(`   ✖ ${error}`);
        }
      }
    } catch (err) {
      log(`Aviso: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, intervalo));
  }
}

async function login() {
  await cargarConfig();
  const ctx = await abrirNavegador(false);
  const fb = await ctx.newPage();
  await fb.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded" }).catch(() => {});
  const ig = await ctx.newPage();
  await ig.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded" }).catch(() => {});
  console.log("\nSe abrió el navegador. Inicia sesión en Facebook y en Instagram (con la cuenta que publica).");
  console.log("Cuando veas tu inicio en ambas, vuelve aquí y pulsa Enter.\n");
  const rl = createInterface({ input: stdin, output: stdout });
  await rl.question("Pulsa Enter cuando hayas iniciado sesión… ");
  rl.close();
  const s = await sesiones(ctx);
  console.log(`\nFacebook: ${s.facebook ? "sesión guardada ✔" : "SIN sesión ✖"}`);
  console.log(`Instagram: ${s.instagram ? "sesión guardada ✔" : "SIN sesión ✖"}`);
  await ctx.close();
  console.log("\nListo. Ahora abre INICIAR.bat y déjalo abierto.\n");
}

async function probar() {
  const cfg = await cargarConfig();
  const panel = new Panel(cfg);
  await panel.login();
  const st = await panel.call("GET", "pc-agent/status");
  console.log("Panel OK. Estado en el panel:", st);
  if (!SIMULAR) {
    const ctx = await abrirNavegador(true);
    console.log("Sesiones guardadas:", await sesiones(ctx));
    await ctx.close();
  }
}

const cmd = process.argv[2] || "run";
const acciones = { run, login, probar };
if (!acciones[cmd]) {
  console.log("Uso: node agente.mjs [login|run|probar]");
  process.exit(1);
}
acciones[cmd]().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
