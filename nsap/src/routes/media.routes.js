import { existsSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";

import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";

const UPLOAD_DIR = resolve(process.env.NSAP_UPLOAD_DIR ?? "data/uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${nanoid()}${extname(file.originalname) || ""}`),
});
// 200 MB: los videos/Reels pueden ser grandes; a Graph se suben por chunks (resumable).
const MAX_UPLOAD_MB = Number(process.env.NSAP_MAX_UPLOAD_MB ?? 200);
const upload = multer({ storage, limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });

export const mediaRouter = Router();

/** Sube un archivo y devuelve su descriptor (para adjuntar a una campaña). */
mediaRouter.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Falta el archivo." });
  const kind = req.file.mimetype.startsWith("image/")
    ? "image"
    : req.file.mimetype.startsWith("video/")
      ? "video"
      : "document";
  res.status(201).json({
    path: req.file.filename,
    filename: req.file.originalname,
    mime: req.file.mimetype,
    kind,
    url: `/api/media/file/${req.file.filename}`,
  });
});

/** Sirve un archivo subido. */
mediaRouter.get("/file/:name", (req, res) => {
  const p = resolve(UPLOAD_DIR, req.params.name.replace(/[^\w.-]/g, ""));
  if (!existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

export { UPLOAD_DIR };
