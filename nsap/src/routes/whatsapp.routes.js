import { Router } from "express";

import { whatsapp } from "../whatsapp.js";

export const whatsappRouter = Router();

whatsappRouter.get("/status", (_req, res) => res.json(whatsapp.getStatus()));

whatsappRouter.post("/connect", async (_req, res, next) => {
  try {
    res.json(await whatsapp.connect());
  } catch (e) {
    next(e);
  }
});

whatsappRouter.post("/reconnect", async (_req, res, next) => {
  try {
    res.json(await whatsapp.connect());
  } catch (e) {
    next(e);
  }
});

whatsappRouter.post("/disconnect", async (_req, res, next) => {
  try {
    res.json(await whatsapp.disconnect());
  } catch (e) {
    next(e);
  }
});

whatsappRouter.post("/sync", async (_req, res, next) => {
  try {
    await whatsapp.sync();
    res.json(whatsapp.getStatus());
  } catch (e) {
    next(e);
  }
});
