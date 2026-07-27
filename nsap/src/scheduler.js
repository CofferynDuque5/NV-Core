import { nanoid } from "nanoid";

import { store } from "./store.js";
import { whatsapp } from "./whatsapp.js";
import { builtinVars, renderTemplate } from "./render.js";

const TICK_MS = 30_000; // evalúa campañas cada 30s
const GROUP_DELAY_MS = Number(process.env.NSAP_GROUP_DELAY_MS ?? 4000); // anti-spam entre grupos

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayKey = () => new Date().toISOString().slice(0, 10);

function isDue(campaign, now) {
  const s = campaign.schedule ?? {};
  if (campaign.status === "sending") return false;
  if (s.type === "once") {
    return campaign.status === "scheduled" && s.at && new Date(s.at).getTime() <= now.getTime();
  }
  if (s.type === "daily") {
    const [h, m] = String(s.at ?? "").split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return false;
    const matches = now.getHours() === h && now.getMinutes() === m;
    return matches && campaign.lastRunDay !== todayKey();
  }
  return false;
}

/**
 * Ejecuta una campaña: envía el mensaje a cada grupo objetivo (con retardo
 * entre grupos) y registra el resultado. Reutilizable por el scheduler y por
 * "Enviar ahora".
 */
export async function runCampaign(id, io) {
  const campaign = store.getCampaign(id);
  if (!campaign) throw new Error("Campaña no encontrada.");
  if (campaign.status === "sending") return campaign;

  if (!whatsapp.isConnected()) {
    store.updateCampaign(id, { status: "failed", lastRunAt: new Date().toISOString() });
    io?.emit("campaigns:changed");
    throw new Error("WhatsApp no está conectado.");
  }

  store.updateCampaign(id, { status: "sending" });
  io?.emit("campaigns:changed");

  const groupsById = new Map(store.getGroups().map((g) => [g.id, g]));
  const results = [];
  for (const groupId of campaign.targetGroups ?? []) {
    const groupName = groupsById.get(groupId)?.subject ?? groupId;
    // Personalización: variables integradas + variables propias del grupo.
    const vars = { ...builtinVars(groupName), ...store.getGroupVars(groupId) };
    const text = renderTemplate(campaign.message, vars);
    const base = {
      id: nanoid(),
      campaignId: id,
      campaignName: campaign.name,
      groupId,
      groupName,
      preview: text.slice(0, 120),
      at: new Date().toISOString(),
    };
    try {
      await whatsapp.sendToGroup(groupId, text);
      const entry = { ...base, ok: true, error: null };
      results.push(entry);
      store.addLog(entry);
    } catch (err) {
      const entry = { ...base, ok: false, error: err.message };
      results.push(entry);
      store.addLog(entry);
    }
    io?.emit("campaigns:progress", { campaignId: id, done: results.length, total: campaign.targetGroups.length });
    io?.emit("logs:changed");
    await sleep(GROUP_DELAY_MS);
  }

  const allOk = results.every((r) => r.ok);
  const recurring = campaign.schedule?.type === "daily";
  store.updateCampaign(id, {
    status: recurring ? "scheduled" : allOk ? "sent" : "failed",
    lastRunAt: new Date().toISOString(),
    lastRunDay: todayKey(),
    lastResults: results,
  });
  io?.emit("campaigns:changed");
  return store.getCampaign(id);
}

/** Arranca el bucle del scheduler (tick cada 30s). */
export function startScheduler(io) {
  const tick = async () => {
    const now = new Date();
    for (const campaign of store.getCampaigns()) {
      if (isDue(campaign, now)) {
        console.log(`[scheduler] disparando campaña "${campaign.name}"`);
        runCampaign(campaign.id, io).catch((e) => console.warn(`[scheduler] ${e.message}`));
      }
    }
  };
  setInterval(tick, TICK_MS);
  console.log(`[scheduler] activo (cada ${TICK_MS / 1000}s, ${GROUP_DELAY_MS}ms entre grupos)`);
}

export { isDue };
