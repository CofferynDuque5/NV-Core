import { Router } from "express";

import { store } from "../store.js";
import { whatsapp } from "../whatsapp.js";

export const groupsRouter = Router();

/** Grupos de la última sincronización (snapshot). */
groupsRouter.get("/", (_req, res) => res.json(store.getGroups()));

/** Fuerza una sincronización con WhatsApp y devuelve los grupos. */
groupsRouter.post("/sync", async (_req, res, next) => {
  try {
    if (!whatsapp.isConnected()) {
      return res.status(409).json({ message: "WhatsApp no está conectado." });
    }
    res.json(await whatsapp.sync());
  } catch (e) {
    next(e);
  }
});

/** Variables de personalización de un grupo. */
groupsRouter.get("/:id/vars", (req, res) => res.json(store.getGroupVars(req.params.id)));

groupsRouter.put("/:id/vars", (req, res) => {
  const vars = req.body ?? {};
  if (typeof vars !== "object" || Array.isArray(vars)) {
    return res.status(400).json({ message: "Se espera un objeto clave/valor." });
  }
  // Normaliza a strings.
  const clean = Object.fromEntries(
    Object.entries(vars)
      .filter(([k]) => /^[\w.-]+$/.test(k))
      .map(([k, v]) => [k, String(v)]),
  );
  res.json(store.setGroupVars(req.params.id, clean));
});
