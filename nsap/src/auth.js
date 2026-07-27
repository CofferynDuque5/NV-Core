import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";

import { store } from "./store.js";

/**
 * Autenticación multiusuario con roles, sin dependencias externas.
 * Sesión = token firmado con HMAC en una cookie httpOnly.
 * Roles: admin (todo), editor (opera), viewer (solo lectura).
 */
export const COOKIE = "nsap_session";
export const ROLES = ["admin", "editor", "viewer"];
const SECRET = process.env.NSAP_SECRET || "nsap-dev-secret-change-me";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

if (!process.env.NSAP_SECRET) {
  console.warn("[auth] NSAP_SECRET por defecto (inseguro). Defínelo en producción.");
}

// ── hashing de contraseñas (scrypt) ──────────────────────────────────────────
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/** Crea el admin inicial desde env si aún no hay usuarios. */
export function seedAdmin() {
  if (store.getUsers().length > 0) return;
  const username = process.env.NSAP_USERNAME || "admin";
  const password = process.env.NSAP_PASSWORD || "admin";
  const { salt, hash } = hashPassword(password);
  store.addUser({ id: nanoid(), username, salt, hash, role: "admin", createdAt: new Date().toISOString() });
  if (!process.env.NSAP_PASSWORD) {
    console.warn(`[auth] Admin inicial "${username}" con contraseña por defecto "admin". Cámbiala.`);
  }
}

export function createUser({ username, password, role }) {
  if (store.findUser(username)) throw Object.assign(new Error("El usuario ya existe."), { status: 409 });
  if (!ROLES.includes(role)) throw Object.assign(new Error("Rol inválido."), { status: 400 });
  const { salt, hash } = hashPassword(password);
  return store.addUser({ id: nanoid(), username, salt, hash, role, createdAt: new Date().toISOString() });
}

// ── tokens de sesión ─────────────────────────────────────────────────────────
const b64 = (s) => Buffer.from(s).toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url").toString("utf8");
const hmac = (data) => createHmac("sha256", SECRET).update(data).digest("base64url");

export function login(username, password) {
  const user = store.findUser(username);
  if (!user || !verifyPassword(password, user.salt, user.hash)) return null;
  const payload = b64(JSON.stringify({ uid: user.id, role: user.role, exp: Date.now() + TTL_MS }));
  return { token: `${payload}.${hmac(payload)}`, user };
}

export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = hmac(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const obj = JSON.parse(unb64(payload));
    return obj.exp > Date.now() ? obj : null;
  } catch {
    return null;
  }
}

// ── cookies ──────────────────────────────────────────────────────────────────
export function readCookie(header, name = COOKIE) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
export function sessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(TTL_MS / 1000)};${secure}`;
}
export function clearCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

// ── middlewares ───────────────────────────────────────────────────────────────
function currentUser(req) {
  const session = verifyToken(readCookie(req.headers.cookie));
  if (!session) return null;
  const user = store.findUserById(session.uid);
  return user ? { id: user.id, username: user.username, role: user.role } : null;
}

export function authMiddleware(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: "No autenticado." });
  req.user = user;
  next();
}

/** Exige uno de los roles indicados (usar tras authMiddleware). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "No tienes permiso para esta acción." });
    }
    next();
  };
}

export function socketAuth(socket, next) {
  if (verifyToken(readCookie(socket.handshake.headers.cookie))) return next();
  next(new Error("unauthorized"));
}

/** Lectura para cualquiera; escritura (POST/PUT/DELETE) solo admin/editor. */
export function mutationGuard(req, res, next) {
  if (req.method === "GET") return next();
  return requireRole("admin", "editor")(req, res, next);
}
