import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import express from "express";
import { Server } from "socket.io";

import { store } from "./src/store.js";
import { whatsapp } from "./src/whatsapp.js";
import { startScheduler } from "./src/scheduler.js";
import { whatsappRouter } from "./src/routes/whatsapp.routes.js";
import { groupsRouter } from "./src/routes/groups.routes.js";
import { campaignsRouter } from "./src/routes/campaigns.routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(express.json());

// APIs (todas dentro del proyecto)
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/campaigns", campaignsRouter);

// Frontend estático (HTML + CSS + JS vanilla + Bootstrap)
app.use(express.static(join(__dirname, "public")));

// Manejador de errores uniforme
app.use((err, _req, res, _next) => {
  console.error("[api]", err.message);
  res.status(err.status ?? 500).json({ message: err.message ?? "Error interno." });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });
app.set("io", io);

// Al conectarse un cliente, mándale el estado actual y los grupos.
io.on("connection", (socket) => {
  socket.emit("wa:status", whatsapp.getStatus());
  socket.emit("wa:groups", store.getGroups());
  if (whatsapp.qr) socket.emit("wa:qr", { dataUrl: whatsapp.qr });
});

whatsapp.init(io);
startScheduler(io);

httpServer.listen(PORT, () => {
  console.log(`\n  NSAP escuchando en http://localhost:${PORT}\n`);
});
