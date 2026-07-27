import { Router } from "express";

import { aiConfigured, generateMessage, selectProvider } from "../ai.js";

export const aiRouter = Router();

aiRouter.get("/status", (_req, res) => res.json({ configured: aiConfigured(), provider: selectProvider() }));

aiRouter.post("/generate", async (req, res, next) => {
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
