import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import express from "express";
import { Server } from "socket.io";

import { store } from "./src/store.js";
import { whatsapp } from "./src/whatsapp.js";
import { startScheduler } from "./src/scheduler.js";
import { authMiddleware, mutationGuard, requireRole, seedAdmin, socketAuth } from "./src/auth.js";
import { authRouter } from "./src/routes/auth.routes.js";
import { usersRouter } from "./src/routes/users.routes.js";
import { whatsappRouter } from "./src/routes/whatsapp.routes.js";
import { groupsRouter } from "./src/routes/groups.routes.js";
import { campaignsRouter } from "./src/routes/campaigns.routes.js";
import { templatesRouter } from "./src/routes/templates.routes.js";
import { logsRouter } from "./src/routes/logs.routes.js";
import { mediaRouter } from "./src/routes/media.routes.js";
import { aiRouter } from "./src/routes/ai.routes.js";
import { contentRouter } from "./src/routes/content.routes.js";
import { n8nRouter, n8nCallbackRouter } from "./src/routes/n8n.routes.js";
import { integrationsRouter } from "./src/routes/integrations.routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);

seedAdmin();

const app = express();
app.use(express.json({ limit: "2mb" }));

// Público
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.get("/api/auth/me", authMiddleware, (req, res) => res.json(req.user));
app.use("/api/n8n", n8nCallbackRouter); // callback público (protegido por token)

// Protegido (requiere sesión). Escritura sólo admin/editor.
app.use("/api/users", authMiddleware, requireRole("admin"), usersRouter);
app.use("/api/whatsapp", authMiddleware, mutationGuard, whatsappRouter);
app.use("/api/groups", authMiddleware, mutationGuard, groupsRouter);
app.use("/api/campaigns", authMiddleware, mutationGuard, campaignsRouter);
app.use("/api/templates", authMiddleware, mutationGuard, templatesRouter);
app.use("/api/content", authMiddleware, mutationGuard, contentRouter);
app.use("/api/media", authMiddleware, mutationGuard, mediaRouter);
app.use("/api/logs", authMiddleware, logsRouter);
app.use("/api/ai", authMiddleware, mutationGuard, aiRouter);
app.use("/api/n8n", authMiddleware, mutationGuard, n8nRouter);
app.use("/api/integrations", authMiddleware, integrationsRouter);

// Frontend estático (HTML + CSS + JS vanilla + Bootstrap)
app.use(express.static(join(__dirname, "public")));

// Errores
app.use((err, _req, res, _next) => {
  console.error("[api]", err.message);
  res.status(err.status ?? 500).json({ message: err.message ?? "Error interno." });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });
io.use(socketAuth);
app.set("io", io);

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
