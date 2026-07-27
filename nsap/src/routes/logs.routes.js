import { Router } from "express";

import { store } from "../store.js";

export const logsRouter = Router();

/** Historial de envíos (más reciente primero), opcionalmente por campaña. */
logsRouter.get("/", (req, res) => {
  const { campaignId } = req.query;
  res.json(store.getLogs(campaignId ? String(campaignId) : undefined));
});
