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
