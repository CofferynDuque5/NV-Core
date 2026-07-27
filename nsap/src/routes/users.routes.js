import { Router } from "express";

import { store } from "../store.js";
import { createUser, hashPassword, ROLES } from "../auth.js";

export const usersRouter = Router();

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt });

usersRouter.get("/", (_req, res) => res.json(store.getUsers().map(publicUser)));

usersRouter.post("/", (req, res) => {
  const { username, password, role } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ message: "Usuario y contraseña requeridos." });
  if (String(password).length < 6) return res.status(400).json({ message: "La contraseña debe tener 6+ caracteres." });
  try {
    const user = createUser({ username: String(username).trim(), password: String(password), role: role ?? "viewer" });
    res.status(201).json(publicUser(user));
  } catch (e) {
    res.status(e.status ?? 400).json({ message: e.message });
  }
});

usersRouter.put("/:id", (req, res) => {
  const { role, password } = req.body ?? {};
  const patch = {};
  if (role) {
    if (!ROLES.includes(role)) return res.status(400).json({ message: "Rol inválido." });
    patch.role = role;
  }
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ message: "La contraseña debe tener 6+ caracteres." });
    Object.assign(patch, hashPassword(String(password)));
  }
  const u = store.updateUser(req.params.id, patch);
  if (!u) return res.status(404).json({ message: "Usuario no encontrado." });
  res.json(publicUser(u));
});

usersRouter.delete("/:id", (req, res) => {
  if (req.user?.id === req.params.id) return res.status(400).json({ message: "No puedes eliminar tu propia cuenta." });
  const admins = store.getUsers().filter((u) => u.role === "admin");
  const target = store.findUserById(req.params.id);
  if (target?.role === "admin" && admins.length <= 1) {
    return res.status(400).json({ message: "No puedes eliminar al último admin." });
  }
  const ok = store.removeUser(req.params.id);
  if (!ok) return res.status(404).json({ message: "Usuario no encontrado." });
  res.status(204).end();
});
