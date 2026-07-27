import { Router } from "express";

import { store } from "../store.js";

export const logsRouter = Router();

/** Historial de envíos (más reciente primero), opcionalmente por campaña. */
logsRouter.get("/", (req, res) => {
  const { campaignId } = req.query;
  res.json(store.getLogs(campaignId ? String(campaignId) : undefined));
});

/** Exporta el historial a CSV. */
logsRouter.get("/export.csv", (_req, res) => {
  const cols = ["at", "campaignName", "groupName", "groupId", "target", "format", "postId", "ok", "error", "preview"];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = store
    .getLogs()
    .map((l) => cols.map((c) => escape(l[c])).join(","));
  const csv = [cols.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="historial-nsap.csv"');
  res.send("﻿" + csv); // BOM para Excel
});
