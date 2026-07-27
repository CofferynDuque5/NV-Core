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
  logs: [], // [{ id, campaignId, campaignName, groupId, groupName, preview, ok, error, at }]
  templates: [], // [{ id, name, body, createdAt }]
  groupVars: {}, // { [groupId]: { clave: valor } }
  users: [], // [{ id, username, salt, hash, role, createdAt }]
  content: [], // [{ id, type:'text'|'media', title, body?, mediaPath?, mime?, tags[], createdAt }]
  n8nJobs: [], // [{ id, workflow, payload, status, result, error, createdAt, updatedAt }]
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

  // ── Plantillas de mensaje ────────────────────────────────────────────────────
  getTemplates() {
    return db.templates;
  },
  addTemplate(tpl) {
    db.templates.unshift(tpl);
    persist();
    return tpl;
  },
  removeTemplate(id) {
    const before = db.templates.length;
    db.templates = db.templates.filter((t) => t.id !== id);
    const changed = db.templates.length !== before;
    if (changed) persist();
    return changed;
  },

  // ── Variables por grupo (personalización) ─────────────────────────────────────
  getGroupVars(groupId) {
    return db.groupVars[groupId] ?? {};
  },
  getAllGroupVars() {
    return db.groupVars;
  },
  setGroupVars(groupId, vars) {
    db.groupVars[groupId] = vars ?? {};
    persist();
    return db.groupVars[groupId];
  },

  // ── Usuarios (multiusuario + roles) ───────────────────────────────────────────
  getUsers() {
    return db.users;
  },
  findUser(username) {
    return db.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase()) ?? null;
  },
  findUserById(id) {
    return db.users.find((u) => u.id === id) ?? null;
  },
  addUser(user) {
    db.users.push(user);
    persist();
    return user;
  },
  updateUser(id, patch) {
    const u = db.users.find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, patch);
    persist();
    return u;
  },
  removeUser(id) {
    const before = db.users.length;
    db.users = db.users.filter((u) => u.id !== id);
    const changed = db.users.length !== before;
    if (changed) persist();
    return changed;
  },

  // ── Contenidos (biblioteca) ──────────────────────────────────────────────────
  getContent() {
    return db.content;
  },
  addContent(item) {
    db.content.unshift(item);
    persist();
    return item;
  },
  removeContent(id) {
    const before = db.content.length;
    db.content = db.content.filter((c) => c.id !== id);
    const changed = db.content.length !== before;
    if (changed) persist();
    return changed;
  },

  // ── Jobs de n8n ──────────────────────────────────────────────────────────────
  getJobs() {
    return db.n8nJobs;
  },
  getJob(id) {
    return db.n8nJobs.find((j) => j.id === id) ?? null;
  },
  addJob(job) {
    db.n8nJobs.unshift(job);
    db.n8nJobs = db.n8nJobs.slice(0, 200);
    persist();
    return job;
  },
  updateJob(id, patch) {
    const j = db.n8nJobs.find((x) => x.id === id);
    if (!j) return null;
    Object.assign(j, patch, { updatedAt: new Date().toISOString() });
    persist();
    return j;
  },
};
