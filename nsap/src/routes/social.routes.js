import { Router } from "express";
import { nanoid } from "nanoid";

import { store } from "../store.js";
import { fbConfigured, igConfigured, publishToTargets } from "../meta.js";

export const socialRouter = Router();

socialRouter.get("/status", (_req, res) =>
  res.json({ facebook: fbConfigured(), instagram: igConfigured() }),
);

/** Publica ahora en Facebook y/o Instagram. */
socialRouter.post("/publish", async (req, res) => {
  const { targets, message, attachment } = req.body ?? {};
  const list = (Array.isArray(targets) ? targets : []).filter((t) => t === "facebook" || t === "instagram");
  if (!list.length) return res.status(400).json({ message: "Elige Facebook y/o Instagram." });
  if (!message && !attachment) return res.status(400).json({ message: "Escribe un mensaje o adjunta una imagen." });

  const results = await publishToTargets(list, { message: message ?? "", attachment: attachment ?? null });
  // Registrar en el historial.
  for (const r of results) {
    store.addLog({
      id: nanoid(),
      campaignId: null,
      campaignName: "Publicación directa",
      groupId: r.target,
      groupName: r.target === "facebook" ? "Facebook" : "Instagram",
      preview: (message ?? "").slice(0, 120),
      ok: r.ok,
      error: r.error ?? null,
      at: new Date().toISOString(),
    });
  }
  req.app.get("io")?.emit("logs:changed");
  res.json({ results });
});
