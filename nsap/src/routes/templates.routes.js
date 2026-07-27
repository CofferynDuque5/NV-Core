import { Router } from "express";
import { nanoid } from "nanoid";

import { store } from "../store.js";
import { extractVars } from "../render.js";

export const templatesRouter = Router();

templatesRouter.get("/", (_req, res) => res.json(store.getTemplates()));

templatesRouter.post("/", (req, res) => {
  const { name, body } = req.body ?? {};
  if (!name || typeof name !== "string") return res.status(400).json({ message: "Falta el nombre." });
  if (!body || typeof body !== "string") return res.status(400).json({ message: "Falta el contenido." });
  const tpl = {
    id: nanoid(),
    name: name.trim(),
    body,
    vars: extractVars(body),
    createdAt: new Date().toISOString(),
  };
  store.addTemplate(tpl);
  res.status(201).json(tpl);
});

templatesRouter.delete("/:id", (req, res) => {
  const ok = store.removeTemplate(req.params.id);
  if (!ok) return res.status(404).json({ message: "Plantilla no encontrada." });
  res.status(204).end();
});
