import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Store JSON auto-contenido (sin base de datos externa).
 * Guarda: metadatos de WhatsApp, snapshot de grupos, campañas y logs de envío.
 */
const DB_PATH = resolve(process.env.NSAP_DATA_DIR ?? "data", "db.json");

const DEFAULTS = {
  whatsapp: { number: null, lastConnectionAt: null, contactsCount: 0 },
  groups: [], // [{ id, subject, size }]
  campaigns: [], // ver createCampaign()
  logs: [], // [{ id, campaignId, groupId, ok, error, at }]
};

let db = load();

function load() {
  try {
    if (existsSync(DB_PATH)) {
      return { ...structuredClone(DEFAULTS), ...JSON.parse(readFileSync(DB_PATH, "utf8")) };
    }
  } catch {
    /* archivo corrupto → arrancamos limpio */
  }
  return structuredClone(DEFAULTS);
}

function persist() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export const store = {
  // ── WhatsApp meta ────────────────────────────────────────────────────────
  getWhatsappMeta() {
    return { ...db.whatsapp };
  },
  setWhatsappMeta(patch) {
    db.whatsapp = { ...db.whatsapp, ...patch };
    persist();
    return db.whatsapp;
  },

  // ── Grupos (snapshot de la última sincronización) ─────────────────────────
  getGroups() {
    return db.groups;
  },
  setGroups(groups) {
    db.groups = groups;
    persist();
    return db.groups;
  },

  // ── Campañas ───────────────────────────────────────────────────────────────
  getCampaigns() {
    return db.campaigns;
  },
  getCampaign(id) {
    return db.campaigns.find((c) => c.id === id) ?? null;
  },
  addCampaign(campaign) {
    db.campaigns.unshift(campaign);
    persist();
    return campaign;
  },
  updateCampaign(id, patch) {
    const c = db.campaigns.find((x) => x.id === id);
    if (!c) return null;
    Object.assign(c, patch);
    persist();
    return c;
  },
  removeCampaign(id) {
    const before = db.campaigns.length;
    db.campaigns = db.campaigns.filter((c) => c.id !== id);
    const changed = db.campaigns.length !== before;
    if (changed) persist();
    return changed;
  },

  // ── Logs de envío ───────────────────────────────────────────────────────────
  addLog(entry) {
    db.logs.unshift(entry);
    db.logs = db.logs.slice(0, 500); // acotar
    persist();
    return entry;
  },
  getLogs(campaignId) {
    return campaignId ? db.logs.filter((l) => l.campaignId === campaignId) : db.logs;
  },
};
