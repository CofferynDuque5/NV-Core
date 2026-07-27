/* global io, bootstrap */

// ── helpers ──────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rel = (iso) => {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace segundos";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : new Date(iso).toLocaleDateString();
};

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
const api = async (path, opts = {}) => {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new HttpError(data?.message || `Error ${res.status}`, res.status);
  return data;
};

let socket = null;
let me = null;
const canWrite = () => me && (me.role === "admin" || me.role === "editor");

// ── login gate ─────────────────────────────────────────────────────────────
async function boot() {
  try {
    me = await api("/auth/me");
    startApp();
  } catch {
    showLogin();
  }
}

function showLogin() {
  $("#login-overlay").classList.remove("d-none");
  $("#app").classList.add("d-none");
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  const f = e.currentTarget;
  try {
    await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: f.username.value, password: f.password.value }),
    });
    me = await api("/auth/me");
    $("#login-overlay").classList.add("d-none");
    startApp();
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});

$("#btn-logout").addEventListener("click", async () => {
  await api("/auth/logout", { method: "POST" }).catch(() => {});
  socket?.disconnect();
  location.reload();
});

// ── app (tras autenticar) ────────────────────────────────────────────────
function startApp() {
  $("#app").classList.remove("d-none");
  applyRole();
  buildWeekDays();
  socket = io({ autoConnect: true });
  socket.on("wa:status", renderStatus);
  socket.on("wa:qr", ({ dataUrl }) => {
    $("#qr-area").innerHTML = `<img src="${dataUrl}" alt="QR de WhatsApp" /><p class="mt-2 mb-0 small text-secondary">Escanéalo desde WhatsApp → Dispositivos vinculados</p>`;
  });
  socket.on("wa:groups", renderGroups);
  socket.on("campaigns:changed", loadCampaigns);
  socket.on("logs:changed", loadLogs);
  socket.on("n8n:changed", loadJobs);
  socket.on("campaigns:progress", ({ campaignId, done, total }) => {
    const el = document.querySelector(`[data-progress="${campaignId}"]`);
    if (el) el.textContent = `Enviando ${done}/${total}…`;
  });

  refreshAll();
}

function applyRole() {
  $("#who").textContent = `${me.username} · ${me.role}`;
  $$('[data-role="admin"]').forEach((el) => (el.hidden = me.role !== "admin"));
  if (!canWrite()) {
    // viewer: ocultar formularios y botones de acción
    $$("form").forEach((f) => (f.style.display = f.id === "login-form" ? "" : "none"));
  }
}

async function refreshAll() {
  try {
    renderStatus(await api("/whatsapp/status"));
    renderGroups(await api("/groups"));
    loadCampaigns();
    loadTemplates();
    loadLogs();
    loadContent();
    loadIntegrations();
    loadJobs();
    if (me.role === "admin") loadUsers();
  } catch (e) {
    console.error(e);
  }
}

// ── tabs ─────────────────────────────────────────────────────────────────
$$("#tabs .nav-link").forEach((btn) =>
  btn.addEventListener("click", () => {
    $$("#tabs .nav-link").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $$("section[data-panel]").forEach((s) => (s.hidden = s.dataset.panel !== btn.dataset.tab));
  }),
);

// ── estado WhatsApp ────────────────────────────────────────────────────────
const BADGE = {
  connected: ["text-bg-success", "Conectado"],
  connecting: ["text-bg-warning", "Conectando…"],
  qr: ["text-bg-warning", "Escanea el QR"],
  disconnected: ["text-bg-secondary", "Desconectado"],
};
function renderStatus(s) {
  const [cls, label] = BADGE[s.status] ?? BADGE.disconnected;
  const badge = $("#wa-badge");
  badge.className = `badge ${cls}`;
  badge.textContent = label;
  $("#wa-number").textContent = s.number ?? "—";
  $("#wa-last").textContent = rel(s.lastConnectionAt);
  $("#wa-groups").textContent = s.groupsCount ?? 0;
  $("#wa-contacts").textContent = s.contactsCount ?? 0;
  $("#btn-connect").classList.toggle("d-none", s.status !== "disconnected");
  ["#btn-sync", "#btn-reconnect", "#btn-disconnect"].forEach((id) =>
    $(id).classList.toggle("d-none", s.status === "disconnected"),
  );
  $("#btn-sync").disabled = s.status !== "connected";
  if (s.status === "connected")
    $("#qr-area").innerHTML =
      '<div class="text-success"><i class="bi bi-phone fs-1"></i><p class="mt-2 mb-0 small">Vinculado a tu teléfono</p></div>';
  else if (s.status === "disconnected")
    $("#qr-area").innerHTML =
      '<div class="text-secondary"><i class="bi bi-qr-code fs-1"></i><p class="mt-2 mb-0 small">Pulsa «Conectar» para generar el QR</p></div>';
  else if (s.status === "connecting")
    $("#qr-area").innerHTML =
      '<div class="text-secondary"><div class="spinner-border"></div><p class="mt-2 mb-0 small">Generando QR…</p></div>';
}

const act = (path) => async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    renderStatus(await api(path, { method: "POST" }));
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
};
$("#btn-connect").addEventListener("click", act("/whatsapp/connect"));
$("#btn-reconnect").addEventListener("click", act("/whatsapp/reconnect"));
$("#btn-sync").addEventListener("click", act("/whatsapp/sync"));
$("#btn-disconnect").addEventListener("click", async (e) => {
  if (!confirm("¿Desconectar WhatsApp? Tendrás que volver a escanear el QR.")) return;
  await act("/whatsapp/disconnect")(e);
});

// ── grupos + variables ─────────────────────────────────────────────────────
let groups = [];
let groupVars = {};
function renderGroups(list) {
  groups = list ?? [];
  const body = $("#groups-body");
  if (!groups.length) {
    body.innerHTML = '<tr><td colspan="4" class="text-secondary text-center py-4">Sin grupos. Conecta y sincroniza.</td></tr>';
  } else {
    body.innerHTML = groups
      .map((g) => {
        const count = Object.keys(groupVars[g.id] ?? {}).length;
        return `<tr>
          <td>${esc(g.subject)}<br><code class="jid">${esc(g.id)}</code></td>
          <td class="text-end">${g.size ?? 0}</td>
          <td>${count ? `<span class="badge text-bg-secondary">${count}</span>` : '<span class="text-secondary small">—</span>'}</td>
          <td class="text-end"><button class="btn btn-outline-light btn-sm" data-vars="${esc(g.id)}"><i class="bi bi-sliders"></i> Variables</button></td>
        </tr>`;
      })
      .join("");
    body.querySelectorAll("[data-vars]").forEach((b) =>
      b.addEventListener("click", () => openVarsModal(b.dataset.vars)),
    );
  }
  renderGroupPicker();
}
$("#btn-sync-groups").addEventListener("click", async (e) => {
  e.currentTarget.disabled = true;
  try {
    renderGroups(await api("/groups/sync", { method: "POST" }));
  } catch (err) {
    alert(err.message);
  } finally {
    e.currentTarget.disabled = false;
  }
});

// modal de variables
let varsGroupId = null;
const varsModal = () => bootstrap.Modal.getOrCreateInstance("#varsModal");
async function openVarsModal(groupId) {
  varsGroupId = groupId;
  const g = groups.find((x) => x.id === groupId);
  $("#vars-group-name").textContent = g?.subject ?? groupId;
  const vars = await api(`/groups/${encodeURIComponent(groupId)}/vars`).catch(() => ({}));
  groupVars[groupId] = vars;
  $("#vars-rows").innerHTML = "";
  const entries = Object.entries(vars);
  if (!entries.length) addVarRow();
  else entries.forEach(([k, v]) => addVarRow(k, v));
  varsModal().show();
}
function addVarRow(k = "", v = "") {
  const row = document.createElement("div");
  row.className = "input-group input-group-sm";
  row.innerHTML = `
    <input class="form-control var-key" placeholder="clave" value="${esc(k)}" />
    <input class="form-control var-val" placeholder="valor" value="${esc(v)}" />
    <button class="btn btn-outline-danger" type="button"><i class="bi bi-x"></i></button>`;
  row.querySelector("button").addEventListener("click", () => row.remove());
  $("#vars-rows").appendChild(row);
}
$("#vars-add").addEventListener("click", () => addVarRow());
$("#vars-save").addEventListener("click", async () => {
  const vars = {};
  $$("#vars-rows .input-group").forEach((r) => {
    const k = r.querySelector(".var-key").value.trim();
    const v = r.querySelector(".var-val").value;
    if (k) vars[k] = v;
  });
  try {
    groupVars[varsGroupId] = await api(`/groups/${encodeURIComponent(varsGroupId)}/vars`, {
      method: "PUT",
      body: JSON.stringify(vars),
    });
    varsModal().hide();
    renderGroups(groups);
  } catch (err) {
    alert(err.message);
  }
});

// ── plantillas ───────────────────────────────────────────────────────────
let templates = [];
async function loadTemplates() {
  templates = await api("/templates").catch(() => []);
  // selector en el formulario de campaña
  const sel = $("#tpl-select");
  sel.innerHTML = '<option value="">Plantilla…</option>' + templates.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  // lista
  const wrap = $("#templates-list");
  wrap.innerHTML = templates.length
    ? templates
        .map(
          (t) => `<div class="card"><div class="card-body py-2">
            <div class="d-flex justify-content-between align-items-start">
              <div><div class="fw-semibold">${esc(t.name)}</div><div class="small text-secondary" style="white-space:pre-wrap">${esc(t.body)}</div></div>
              <button class="btn btn-outline-danger btn-sm" data-del-tpl="${esc(t.id)}"><i class="bi bi-trash"></i></button>
            </div></div></div>`,
        )
        .join("")
    : '<div class="text-secondary small">Aún no hay plantillas.</div>';
  wrap.querySelectorAll("[data-del-tpl]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("¿Eliminar la plantilla?")) return;
      await api(`/templates/${b.dataset.delTpl}`, { method: "DELETE" }).catch((e) => alert(e.message));
      loadTemplates();
    }),
  );
}
$("#template-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#template-error").textContent = "";
  const f = e.currentTarget;
  try {
    await api("/templates", { method: "POST", body: JSON.stringify({ name: f.name.value, body: f.body.value }) });
    f.reset();
    loadTemplates();
  } catch (err) {
    $("#template-error").textContent = err.message;
  }
});
$("#tpl-select").addEventListener("change", (e) => {
  const t = templates.find((x) => x.id === e.target.value);
  if (t) $("#campaign-message").value = t.body;
});

// ── campañas ─────────────────────────────────────────────────────────────
function renderGroupPicker() {
  const box = $("#group-picker");
  box.innerHTML = groups.length
    ? groups
        .map(
          (g) => `<div class="form-check">
            <input class="form-check-input" type="checkbox" value="${esc(g.id)}" id="gp-${esc(g.id)}" />
            <label class="form-check-label small" for="gp-${esc(g.id)}">${esc(g.subject)} <span class="text-secondary">(${g.size ?? 0})</span></label>
          </div>`,
        )
        .join("")
    : '<div class="text-secondary small">Sincroniza grupos primero.</div>';
}
$("#pick-all").addEventListener("click", (e) => {
  e.preventDefault();
  const boxes = $$("#group-picker input[type=checkbox]");
  const all = boxes.every((b) => b.checked);
  boxes.forEach((b) => (b.checked = !all));
});
const WEEK = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
function buildWeekDays() {
  const box = $("#week-days");
  if (!box) return;
  box.innerHTML = WEEK.map(
    (d, i) => `<input type="checkbox" class="btn-check" id="wd-${i}" value="${i}" />
      <label class="btn btn-outline-light" for="wd-${i}">${d}</label>`,
  ).join("");
}
$$('input[name="schedType"]').forEach((r) =>
  r.addEventListener("change", () => {
    const t = document.querySelector('input[name="schedType"]:checked').value;
    $("#once-at").classList.toggle("d-none", t !== "once");
    $("#daily-at").classList.toggle("d-none", t !== "daily");
    $("#weekly-box").classList.toggle("d-none", t !== "weekly");
  }),
);

// adjunto seleccionado
$("#campaign-file").addEventListener("change", (e) => {
  const f = e.target.files[0];
  $("#attach-info").textContent = f ? `${f.name} (${Math.round(f.size / 1024)} KB)` : "";
});

// generar con IA
$("#btn-ai").addEventListener("click", async () => {
  const prompt = window.prompt("Describe la campaña (brief) para generar el mensaje con IA:");
  if (!prompt) return;
  const btn = $("#btn-ai");
  btn.disabled = true;
  try {
    const { text } = await api("/ai/generate", { method: "POST", body: JSON.stringify({ prompt }) });
    $("#campaign-message").value = text;
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

async function uploadFile(inputEl) {
  const file = inputEl.files[0];
  if (!file) return null;
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/media/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Fallo al subir el archivo.");
  return res.json();
}

$("#campaign-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#campaign-error").textContent = "";
  const f = e.currentTarget;
  const targetGroups = $$("#group-picker input:checked").map((b) => b.value);
  const type = document.querySelector('input[name="schedType"]:checked').value;
  let schedule;
  if (type === "once") schedule = { type: "once", at: f.onceAt.value ? new Date(f.onceAt.value).toISOString() : null };
  else if (type === "daily") schedule = { type: "daily", at: f.dailyAt.value };
  else schedule = { type: "weekly", at: f.weeklyAt.value, days: $$("#week-days input:checked").map((c) => Number(c.value)) };
  try {
    const attachment = await uploadFile($("#campaign-file"));
    await api("/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: f.name.value, message: f.message.value, targetGroups, schedule, attachment }),
    });
    f.reset();
    $("#daily-at").value = "08:00";
    $("#weekly-at").value = "08:00";
    $("#attach-info").textContent = "";
    renderGroupPicker();
    loadCampaigns();
  } catch (err) {
    $("#campaign-error").textContent = err.message;
  }
});

const STATUS_BADGE = {
  scheduled: "text-bg-info",
  sending: "text-bg-warning",
  sent: "text-bg-success",
  failed: "text-bg-danger",
  paused: "text-bg-secondary",
};
function scheduleText(c) {
  if (c.schedule?.type === "daily") return `Diaria a las ${c.schedule.at}`;
  if (c.schedule?.type === "once") return `Una vez · ${new Date(c.schedule.at).toLocaleString()}`;
  return "—";
}
async function loadCampaigns() {
  const list = await api("/campaigns").catch(() => []);
  const wrap = $("#campaigns-list");
  if (!list.length) {
    wrap.innerHTML = '<div class="text-secondary small">Aún no hay campañas.</div>';
    return;
  }
  wrap.innerHTML = list
    .map((c) => {
      const paused = c.status === "paused";
      const toggle = paused
        ? `<button class="btn btn-outline-info" data-resume="${esc(c.id)}"><i class="bi bi-play"></i></button>`
        : `<button class="btn btn-outline-secondary" data-pause="${esc(c.id)}"><i class="bi bi-pause"></i></button>`;
      return `<div class="card campaign-card"><div class="card-body py-2">
        <div class="d-flex align-items-center justify-content-between">
          <div>
            <div class="fw-semibold">${esc(c.name)} <span class="badge ${STATUS_BADGE[c.status] ?? "text-bg-secondary"}">${esc(c.status)}</span></div>
            <div class="small text-secondary">${esc(scheduleText(c))} · ${c.targetGroups.length} grupo(s)</div>
            <div class="small text-secondary" data-progress="${esc(c.id)}">${c.lastRunAt ? "Última ejecución: " + rel(c.lastRunAt) : ""}</div>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-success" data-run="${esc(c.id)}"><i class="bi bi-play-fill"></i> Enviar</button>
            ${toggle}
            <button class="btn btn-outline-danger" data-del="${esc(c.id)}"><i class="bi bi-trash"></i></button>
          </div>
        </div></div></div>`;
    })
    .join("");
  const bind = (attr, path, method = "POST", confirmMsg) =>
    wrap.querySelectorAll(`[data-${attr}]`).forEach((b) =>
      b.addEventListener("click", async () => {
        if (confirmMsg && !confirm(confirmMsg)) return;
        b.disabled = true;
        try {
          await api(`/campaigns/${b.dataset[attr]}${path}`, { method });
        } catch (err) {
          alert(err.message);
        } finally {
          loadCampaigns();
        }
      }),
    );
  bind("run", "/run");
  bind("pause", "/pause");
  bind("resume", "/resume");
  bind("del", "", "DELETE", "¿Eliminar la campaña?");
}

// ── historial ──────────────────────────────────────────────────────────────
async function loadLogs() {
  const logs = await api("/logs").catch(() => []);
  const body = $("#logs-body");
  if (!logs.length) {
    body.innerHTML = '<tr><td colspan="5" class="text-secondary text-center py-4">Sin envíos todavía.</td></tr>';
    return;
  }
  body.innerHTML = logs
    .map(
      (l) => `<tr>
        <td class="small">${new Date(l.at).toLocaleString()}</td>
        <td class="small">${esc(l.campaignName ?? "—")}</td>
        <td class="small">${esc(l.groupName ?? l.groupId)}</td>
        <td>${l.ok ? '<span class="badge text-bg-success">OK</span>' : '<span class="badge text-bg-danger">Error</span>'}</td>
        <td class="small text-secondary">${esc(l.ok ? l.preview ?? "" : l.error ?? "")}</td>
      </tr>`,
    )
    .join("");
}
$("#btn-refresh-logs").addEventListener("click", loadLogs);

// ── contenidos ─────────────────────────────────────────────────────────────
async function loadContent() {
  const items = await api("/content").catch(() => []);
  const wrap = $("#content-list");
  if (!wrap) return;
  wrap.innerHTML = items.length
    ? items
        .map(
          (c) => `<div class="col-md-6"><div class="card h-100"><div class="card-body py-2">
            <div class="d-flex justify-content-between">
              <div class="fw-semibold">${esc(c.title)} <span class="badge text-bg-secondary">${esc(c.type)}</span></div>
              <button class="btn btn-outline-danger btn-sm" data-del-content="${esc(c.id)}"><i class="bi bi-trash"></i></button>
            </div>
            ${c.type === "media" && c.media ? `<a href="${esc(c.media.url)}" target="_blank" class="small">${esc(c.media.filename)}</a>` : `<div class="small text-secondary" style="white-space:pre-wrap">${esc(c.body)}</div>`}
            ${c.tags?.length ? `<div class="mt-1">${c.tags.map((t) => `<span class="badge text-bg-dark">${esc(t)}</span>`).join(" ")}</div>` : ""}
          </div></div></div>`,
        )
        .join("")
    : '<div class="text-secondary small">Aún no hay contenidos.</div>';
  wrap.querySelectorAll("[data-del-content]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("¿Eliminar el contenido?")) return;
      await api(`/content/${b.dataset.delContent}`, { method: "DELETE" }).catch((e) => alert(e.message));
      loadContent();
    }),
  );
}
$("#content-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#content-error").textContent = "";
  const f = e.currentTarget;
  const tags = f.tags.value.split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const media = await uploadFile($("#content-file"));
    await api("/content", {
      method: "POST",
      body: JSON.stringify({
        type: media ? "media" : "text",
        title: f.title.value,
        body: f.body.value,
        media,
        tags,
      }),
    });
    f.reset();
    loadContent();
  } catch (err) {
    $("#content-error").textContent = err.message;
  }
});

// ── integraciones (estado) + n8n ────────────────────────────────────────────
async function loadIntegrations() {
  const wrap = $("#integrations-cards");
  if (!wrap) return;
  const s = await api("/integrations/status").catch(() => null);
  if (!s) return;
  const card = (name, ok, note) => `<div class="col-sm-6 col-lg-3"><div class="card h-100"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center">
        <span class="fw-semibold">${name}</span>
        <span class="badge ${ok ? "text-bg-success" : "text-bg-secondary"}">${ok ? "Conectado" : "Sin configurar"}</span>
      </div>
      <div class="small text-secondary mt-1">${note}</div>
    </div></div></div>`;
  wrap.innerHTML =
    card("IA", s.ai.configured, s.ai.provider ? `Proveedor: ${s.ai.provider}` : "Define una API key de IA") +
    card("n8n", s.n8n.configured, s.n8n.configured ? "Listo para enviar workflows" : "Define N8N_WEBHOOK_URL o N8N_BASE_URL") +
    card("Facebook", s.facebook.configured, s.facebook.needs.join(", ")) +
    card("Instagram", s.instagram.configured, s.instagram.needs.join(", "));
}
$("#n8n-dispatch")?.addEventListener("click", async () => {
  let payload = {};
  const raw = $("#n8n-payload").value.trim();
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      return alert("El payload debe ser JSON válido.");
    }
  }
  try {
    await api("/n8n/dispatch", { method: "POST", body: JSON.stringify({ workflow: $("#n8n-workflow").value.trim(), payload }) });
    loadJobs();
  } catch (err) {
    alert(err.message);
  }
});
async function loadJobs() {
  const box = $("#n8n-jobs");
  if (!box) return;
  const jobs = await api("/n8n/jobs").catch(() => []);
  box.innerHTML = jobs.length
    ? `<table class="table table-sm mb-0"><thead><tr><th>Job</th><th>Workflow</th><th>Estado</th><th>Actualizado</th></tr></thead><tbody>${jobs
        .map(
          (j) => `<tr><td><code>${esc(j.id.slice(0, 8))}</code></td><td>${esc(j.workflow ?? "—")}</td>
            <td><span class="badge ${j.status === "done" ? "text-bg-success" : j.status === "error" ? "text-bg-danger" : "text-bg-warning"}">${esc(j.status)}</span></td>
            <td class="text-secondary">${rel(j.updatedAt)}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : '<div class="text-secondary">Sin trabajos enviados.</div>';
}

// ── usuarios (admin) ─────────────────────────────────────────────────────────
async function loadUsers() {
  const body = $("#users-body");
  if (!body) return;
  const users = await api("/users").catch(() => []);
  body.innerHTML = users
    .map(
      (u) => `<tr>
        <td>${esc(u.username)}</td>
        <td><span class="badge text-bg-info">${esc(u.role)}</span></td>
        <td class="small text-secondary">${new Date(u.createdAt).toLocaleDateString()}</td>
        <td class="text-end">${u.id === me.id ? '<span class="small text-secondary">tú</span>' : `<button class="btn btn-outline-danger btn-sm" data-del-user="${esc(u.id)}"><i class="bi bi-trash"></i></button>`}</td>
      </tr>`,
    )
    .join("");
  body.querySelectorAll("[data-del-user]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("¿Eliminar el usuario?")) return;
      await api(`/users/${b.dataset.delUser}`, { method: "DELETE" }).catch((e) => alert(e.message));
      loadUsers();
    }),
  );
}
$("#user-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#user-error").textContent = "";
  const f = e.currentTarget;
  try {
    await api("/users", {
      method: "POST",
      body: JSON.stringify({ username: f.username.value, password: f.password.value, role: f.role.value }),
    });
    f.reset();
    loadUsers();
  } catch (err) {
    $("#user-error").textContent = err.message;
  }
});

boot();
