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
  throw new Error("schedule.type debe ser 'once' o 'daily'.");
}

campaignsRouter.get("/", (_req, res) => res.json(store.getCampaigns()));

campaignsRouter.post("/", (req, res) => {
  const { name, message, targetGroups, schedule } = req.body ?? {};
  if (!name || typeof name !== "string") return res.status(400).json({ message: "Falta el nombre." });
  if (!message || typeof message !== "string") return res.status(400).json({ message: "Falta el mensaje." });
  if (!Array.isArray(targetGroups) || targetGroups.length === 0) {
    return res.status(400).json({ message: "Selecciona al menos un grupo objetivo." });
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
    message,
    targetGroups,
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
