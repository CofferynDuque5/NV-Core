import { Router } from "express";

import { AUTH_USERNAME, clearCookie, login, sessionCookie } from "../auth.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  const token = login(String(username ?? ""), String(password ?? ""));
  if (!token) return res.status(401).json({ message: "Usuario o contraseña incorrectos." });
  res.setHeader("Set-Cookie", sessionCookie(token));
  res.json({ username: AUTH_USERNAME });
});

authRouter.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", clearCookie());
  res.status(204).end();
});
