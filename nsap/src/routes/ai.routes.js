import { Router } from "express";

import {
  aiConfigured,
  bestSendTimes,
  generateMessage,
  generateRecommendations,
  improveMessage,
  selectProvider,
} from "../ai.js";
import { store } from "../store.js";

export const aiRouter = Router();

aiRouter.get("/status", (_req, res) => res.json({ configured: aiConfigured(), provider: selectProvider() }));

aiRouter.post("/generate", async (req, res) => {
  try {
    const { prompt, tone } = req.body ?? {};
    if (!prompt || String(prompt).trim().length < 3) {
      return res.status(400).json({ message: "Escribe un brief más descriptivo." });
    }
    const text = await generateMessage({ prompt: String(prompt), tone });
    res.json({ text });
  } catch (e) {
    res.status(e.status ?? 500).json({ message: e.message });
  }
});

/** Mejora un mensaje existente (mantiene las variables). */
aiRouter.post("/improve", async (req, res) => {
  try {
    const { message, tone } = req.body ?? {};
    const text = await improveMessage({ message: String(message ?? ""), tone });
    res.json({ text });
  } catch (e) {
    res.status(e.status ?? 500).json({ message: e.message });
  }
});

/**
 * Recomendaciones IA a partir de tus grupos + historial + plantillas.
 * Devuelve también los mejores horarios (heurístico, funciona sin clave de IA).
 */
aiRouter.post("/recommendations", async (req, res) => {
  const logs = store.getLogs();
  const times = bestSendTimes(logs);
  try {
    const recommendations = await generateRecommendations({
      groups: store.getGroups(),
      logs,
      templates: store.getTemplates(),
    });
    res.json({ recommendations, times, aiConfigured: true });
  } catch (e) {
    // Sin clave de IA seguimos devolviendo los horarios (degradación limpia).
    res.status(e.status === 503 ? 200 : e.status ?? 500).json({
      recommendations: [],
      times,
      aiConfigured: false,
      message: e.message,
    });
  }
});
