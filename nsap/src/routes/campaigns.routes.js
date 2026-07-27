import { Router } from "express";
import { nanoid } from "nanoid";

import { store } from "../store.js";
import { runCampaign } from "../scheduler.js";

export const campaignsRouter = Router();

/** Valida y normaliza la programación. */
function parseSchedule(schedule) {
  const s = schedule ?? {};
  if (s.type === "once") {
    if (!s.at || Number.isNaN(new Date(s.at).getTime())) {
      throw new Error("Programación 'once' requiere una fecha/hora válida (at ISO).");
    }
    return { type: "once", at: new Date(s.at).toISOString() };
  }
  if (s.type === "daily") {
    if (!/^\d{1,2}:\d{2}$/.test(String(s.at ?? ""))) {
      throw new Error("Programación 'daily' requiere hora en formato HH:MM.");
    }
    return { type: "daily", at: s.at };
  }
  if (s.type === "weekly") {
    if (!/^\d{1,2}:\d{2}$/.test(String(s.at ?? ""))) {
      throw new Error("Programación 'weekly' requiere hora en formato HH:MM.");
    }
    const days = (Array.isArray(s.days) ? s.days : []).map(Number).filter((d) => d >= 0 && d <= 6);
    if (!days.length) throw new Error("Programación 'weekly' requiere al menos un día.");
    return { type: "weekly", at: s.at, days: [...new Set(days)].sort() };
  }
  throw new Error("schedule.type debe ser 'once', 'daily' o 'weekly'.");
}

campaignsRouter.get("/", (_req, res) => res.json(store.getCampaigns()));

campaignsRouter.post("/", (req, res) => {
  const { name, message, targetGroups, schedule, attachment, attachments, socialTargets, socialFormat } =
    req.body ?? {};
  if (!name || typeof name !== "string") return res.status(400).json({ message: "Falta el nombre." });
  const media = Array.isArray(attachments) ? attachments : [];
  if ((!message || typeof message !== "string") && !attachment && !media.length) {
    return res.status(400).json({ message: "Falta el mensaje o un adjunto." });
  }
  const social = (Array.isArray(socialTargets) ? socialTargets : []).filter(
    (t) => t === "facebook" || t === "instagram",
  );
  const VALID_FORMATS = ["feed", "reel", "story", "carousel"];
  const format = VALID_FORMATS.includes(socialFormat) ? socialFormat : null;
  const groups = Array.isArray(targetGroups) ? targetGroups : [];
  if (groups.length === 0 && social.length === 0) {
    return res.status(400).json({ message: "Elige grupos de WhatsApp y/o redes (Facebook/Instagram)." });
  }
  let parsed;
  try {
    parsed = parseSchedule(schedule);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }

  const campaign = {
    id: nanoid(),
    name: name.trim(),
    message: message ?? "",
    attachment: attachment ?? null, // { path, mime, filename, kind: 'image'|'document'|'video' }
    attachments: media, // varios adjuntos (carrusel IG)
    targetGroups: groups,
    socialTargets: social, // ['facebook','instagram']
    socialFormat: format, // 'feed'|'reel'|'story'|'carousel'|null
    schedule: parsed,
    status: "scheduled",
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    lastRunDay: null,
    lastResults: [],
  };
  store.addCampaign(campaign);
  req.app.get("io")?.emit("campaigns:changed");
  res.status(201).json(campaign);
});

campaignsRouter.delete("/:id", (req, res) => {
  const ok = store.removeCampaign(req.params.id);
  if (!ok) return res.status(404).json({ message: "Campaña no encontrada." });
  req.app.get("io")?.emit("campaigns:changed");
  res.status(204).end();
});

campaignsRouter.post("/:id/run", async (req, res, next) => {
  try {
    const campaign = await runCampaign(req.params.id, req.app.get("io"));
    res.json(campaign);
  } catch (e) {
    next(e);
  }
});

campaignsRouter.get("/:id/logs", (req, res) => res.json(store.getLogs(req.params.id)));

campaignsRouter.post("/:id/pause", (req, res) => {
  const c = store.updateCampaign(req.params.id, { status: "paused" });
  if (!c) return res.status(404).json({ message: "Campaña no encontrada." });
  req.app.get("io")?.emit("campaigns:changed");
  res.json(c);
});

campaignsRouter.post("/:id/resume", (req, res) => {
  const c = store.updateCampaign(req.params.id, { status: "scheduled" });
  if (!c) return res.status(404).json({ message: "Campaña no encontrada." });
  req.app.get("io")?.emit("campaigns:changed");
  res.json(c);
});
