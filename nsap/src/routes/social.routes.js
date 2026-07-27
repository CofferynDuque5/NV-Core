import { Router } from "express";
import { nanoid } from "nanoid";

import { store } from "../store.js";
import { fbConfigured, igConfigured, getInsights, publishToTargets } from "../meta.js";

export const socialRouter = Router();

socialRouter.get("/status", (_req, res) =>
  res.json({ facebook: fbConfigured(), instagram: igConfigured() }),
);

/** Publica ahora en Facebook y/o Instagram. */
socialRouter.post("/publish", async (req, res) => {
  const { targets, message, attachment, attachments, format } = req.body ?? {};
  const list = (Array.isArray(targets) ? targets : []).filter((t) => t === "facebook" || t === "instagram");
  if (!list.length) return res.status(400).json({ message: "Elige Facebook y/o Instagram." });
  const media = Array.isArray(attachments) ? attachments : [];
  if (!message && !attachment && !media.length) {
    return res.status(400).json({ message: "Escribe un mensaje o adjunta imagen/video." });
  }

  const results = await publishToTargets(list, {
    message: message ?? "",
    attachment: attachment ?? null,
    attachments: media.length ? media : null,
    format: format ?? null,
  });
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
      target: r.target,
      postId: r.id ?? null,
      format: r.format ?? format ?? null,
      at: new Date().toISOString(),
    });
  }
  req.app.get("io")?.emit("logs:changed");
  res.json({ results });
});

/** Métricas/insights de una publicación ya realizada. */
socialRouter.get("/insights", async (req, res) => {
  const { target, id } = req.query ?? {};
  if ((target !== "facebook" && target !== "instagram") || !id) {
    return res.status(400).json({ message: "Faltan parámetros: target (facebook|instagram) e id." });
  }
  try {
    const data = await getInsights(target, String(id));
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ message: err.message });
  }
});
