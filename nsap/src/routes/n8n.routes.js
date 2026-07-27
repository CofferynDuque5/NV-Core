import { Router } from "express";

import { store } from "../store.js";
import { CALLBACK_TOKEN, dispatch, handleCallback, n8nConfigured } from "../n8n.js";

/** Rutas protegidas de n8n (status, dispatch, jobs). */
export const n8nRouter = Router();

n8nRouter.get("/status", (_req, res) => res.json({ configured: n8nConfigured() }));
n8nRouter.get("/jobs", (_req, res) => res.json(store.getJobs()));

n8nRouter.post("/dispatch", async (req, res, next) => {
  try {
    const { workflow, payload } = req.body ?? {};
    const job = await dispatch({ workflow, payload }, req.app.get("io"));
    res.status(201).json(job);
  } catch (e) {
    res.status(e.status ?? 500).json({ message: e.message });
  }
});

/** Callback PÚBLICO que llama n8n con el resultado (protegido por token). */
export const n8nCallbackRouter = Router();
n8nCallbackRouter.post("/callback", (req, res) => {
  if (CALLBACK_TOKEN && req.query.token !== CALLBACK_TOKEN) {
    return res.status(403).json({ message: "Token inválido." });
  }
  const updated = handleCallback(req.body ?? {}, req.app.get("io"));
  if (!updated) return res.status(404).json({ message: "Job no encontrado." });
  res.json({ ok: true });
});
