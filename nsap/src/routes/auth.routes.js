import { Router } from "express";

import { clearCookie, login, sessionCookie } from "../auth.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  const result = login(String(username ?? ""), String(password ?? ""));
  if (!result) return res.status(401).json({ message: "Usuario o contraseña incorrectos." });
  res.setHeader("Set-Cookie", sessionCookie(result.token));
  res.json({ username: result.user.username, role: result.user.role });
});

authRouter.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", clearCookie());
  res.status(204).end();
});
