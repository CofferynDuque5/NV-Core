/* global io, bootstrap */
const socket = io();

// ── helpers ──────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const api = async (path, opts = {}) => {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
};
const rel = (iso) => {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace segundos";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : new Date(iso).toLocaleDateString();
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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
let currentStatus = "disconnected";

function renderStatus(s) {
  currentStatus = s.status;
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

  if (s.status === "connected") {
    $("#qr-area").innerHTML =
      '<div class="text-success"><i class="bi bi-phone fs-1"></i><p class="mt-2 mb-0 small">Vinculado a tu teléfono</p></div>';
  } else if (s.status === "disconnected") {
    $("#qr-area").innerHTML =
      '<div class="text-secondary"><i class="bi bi-qr-code fs-1"></i><p class="mt-2 mb-0 small">Pulsa «Conectar» para generar el QR</p></div>';
  } else if (s.status === "connecting") {
    $("#qr-area").innerHTML =
      '<div class="text-secondary"><div class="spinner-border"></div><p class="mt-2 mb-0 small">Generando QR…</p></div>';
  }
}

socket.on("wa:status", renderStatus);
socket.on("wa:qr", ({ dataUrl }) => {
  $("#qr-area").innerHTML = `<img src="${dataUrl}" alt="QR de WhatsApp" /><p class="mt-2 mb-0 small text-secondary">Escanéalo desde WhatsApp → Dispositivos vinculados</p>`;
});
socket.on("wa:groups", renderGroups);
socket.on("campaigns:changed", loadCampaigns);
socket.on("campaigns:progress", ({ campaignId, done, total }) => {
  const el = document.querySelector(`[data-progress="${campaignId}"]`);
  if (el) el.textContent = `Enviando ${done}/${total}…`;
});

// botones de conexión
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

// ── grupos ───────────────────────────────────────────────────────────────
let groups = [];
function renderGroups(list) {
  groups = list ?? [];
  const body = $("#groups-body");
  if (!groups.length) {
    body.innerHTML = '<tr><td colspan="3" class="text-secondary text-center py-4">Sin grupos. Conecta y sincroniza.</td></tr>';
  } else {
    body.innerHTML = groups
      .map(
        (g) =>
          `<tr><td>${esc(g.subject)}</td><td class="text-end">${g.size ?? 0}</td><td><code class="jid">${esc(g.id)}</code></td></tr>`,
      )
      .join("");
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

// ── campañas: picker + form ────────────────────────────────────────────────
function renderGroupPicker() {
  const box = $("#group-picker");
  if (!groups.length) {
    box.innerHTML = '<div class="text-secondary small">Sincroniza grupos primero.</div>';
    return;
  }
  box.innerHTML = groups
    .map(
      (g) => `<div class="form-check">
        <input class="form-check-input" type="checkbox" value="${esc(g.id)}" id="gp-${esc(g.id)}" />
        <label class="form-check-label small" for="gp-${esc(g.id)}">${esc(g.subject)} <span class="text-secondary">(${g.size ?? 0})</span></label>
      </div>`,
    )
    .join("");
}
$("#pick-all").addEventListener("click", (e) => {
  e.preventDefault();
  const boxes = $$("#group-picker input[type=checkbox]");
  const allChecked = boxes.every((b) => b.checked);
  boxes.forEach((b) => (b.checked = !allChecked));
});

$$('input[name="schedType"]').forEach((r) =>
  r.addEventListener("change", () => {
    const daily = $("#sched-daily").checked;
    $("#once-at").classList.toggle("d-none", daily);
    $("#daily-at").classList.toggle("d-none", !daily);
  }),
);

$("#campaign-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#campaign-error").textContent = "";
  const form = e.currentTarget;
  const targetGroups = $$("#group-picker input:checked").map((b) => b.value);
  const type = form.schedType.value;
  const schedule =
    type === "once"
      ? { type: "once", at: form.onceAt.value ? new Date(form.onceAt.value).toISOString() : null }
      : { type: "daily", at: form.dailyAt.value };
  try {
    await api("/campaigns", {
      method: "POST",
      body: JSON.stringify({
        name: form.name.value,
        message: form.message.value,
        targetGroups,
        schedule,
      }),
    });
    form.reset();
    $("#daily-at").value = "08:00";
    renderGroupPicker();
    loadCampaigns();
  } catch (err) {
    $("#campaign-error").textContent = err.message;
  }
});

// ── campañas: lista ──────────────────────────────────────────────────────
const STATUS_BADGE = {
  scheduled: "text-bg-info",
  sending: "text-bg-warning",
  sent: "text-bg-success",
  failed: "text-bg-danger",
};
function scheduleText(c) {
  if (c.schedule?.type === "daily") return `Diaria a las ${c.schedule.at}`;
  if (c.schedule?.type === "once") return `Una vez · ${new Date(c.schedule.at).toLocaleString()}`;
  return "—";
}
async function loadCampaigns() {
  let list = [];
  try {
    list = await api("/campaigns");
  } catch {
    return;
  }
  const wrap = $("#campaigns-list");
  if (!list.length) {
    wrap.innerHTML = '<div class="text-secondary small">Aún no hay campañas.</div>';
    return;
  }
  wrap.innerHTML = list
    .map(
      (c) => `<div class="card campaign-card"><div class="card-body py-2">
        <div class="d-flex align-items-center justify-content-between">
          <div>
            <div class="fw-semibold">${esc(c.name)} <span class="badge ${STATUS_BADGE[c.status] ?? "text-bg-secondary"}">${esc(c.status)}</span></div>
            <div class="small text-secondary">${esc(scheduleText(c))} · ${c.targetGroups.length} grupo(s)</div>
            <div class="small text-secondary" data-progress="${esc(c.id)}">${c.lastRunAt ? "Última ejecución: " + rel(c.lastRunAt) : ""}</div>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-success" data-run="${esc(c.id)}"><i class="bi bi-play-fill"></i> Enviar ahora</button>
            <button class="btn btn-outline-danger" data-del="${esc(c.id)}"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div></div>`,
    )
    .join("");

  wrap.querySelectorAll("[data-run]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await api(`/campaigns/${b.dataset.run}/run`, { method: "POST" });
      } catch (err) {
        alert(err.message);
      } finally {
        b.disabled = false;
        loadCampaigns();
      }
    }),
  );
  wrap.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("¿Eliminar la campaña?")) return;
      await api(`/campaigns/${b.dataset.del}`, { method: "DELETE" }).catch((e) => alert(e.message));
      loadCampaigns();
    }),
  );
}

// ── init ─────────────────────────────────────────────────────────────────
(async () => {
  try {
    renderStatus(await api("/whatsapp/status"));
    renderGroups(await api("/groups"));
    loadCampaigns();
  } catch (err) {
    console.error(err);
  }
})();
