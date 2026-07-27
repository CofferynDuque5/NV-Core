import { Router } from "express";
import { nanoid } from "nanoid";

import { store } from "../store.js";

export const contentRouter = Router();

/** Biblioteca de contenidos reutilizables (texto o media). */
contentRouter.get("/", (_req, res) => res.json(store.getContent()));

contentRouter.post("/", (req, res) => {
  const { type, title, body, media, tags } = req.body ?? {};
  if (!title || typeof title !== "string") return res.status(400).json({ message: "Falta el título." });
  const kind = type === "media" ? "media" : "text";
  if (kind === "text" && !body) return res.status(400).json({ message: "Falta el contenido de texto." });
  if (kind === "media" && !media?.path) return res.status(400).json({ message: "Falta el archivo." });

  const item = {
    id: nanoid(),
    type: kind,
    title: title.trim(),
    body: kind === "text" ? body : "",
    media: kind === "media" ? media : null, // { path, mime, filename, kind, url }
    tags: Array.isArray(tags) ? tags.map(String) : [],
    createdAt: new Date().toISOString(),
  };
  store.addContent(item);
  res.status(201).json(item);
});

contentRouter.delete("/:id", (req, res) => {
  const ok = store.removeContent(req.params.id);
  if (!ok) return res.status(404).json({ message: "Contenido no encontrado." });
  res.status(204).end();
});
