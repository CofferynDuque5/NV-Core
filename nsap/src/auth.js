import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Autenticación mínima de un solo administrador, sin dependencias externas.
 * La sesión es un token firmado con HMAC guardado en una cookie httpOnly.
 * Credenciales y secreto se toman de variables de entorno (con aviso si son las
 * de por defecto).
 */
export const COOKIE = "nsap_session";
const SECRET = process.env.NSAP_SECRET || "nsap-dev-secret-change-me";
const USERNAME = process.env.NSAP_USERNAME || "admin";
const PASSWORD = process.env.NSAP_PASSWORD || "admin";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

if (!process.env.NSAP_PASSWORD || !process.env.NSAP_SECRET) {
  console.warn(
    "[auth] Usando credenciales/secreto por defecto (admin/admin). " +
      "Define NSAP_USERNAME, NSAP_PASSWORD y NSAP_SECRET en producción.",
  );
}

const b64 = (s) => Buffer.from(s).toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url").toString("utf8");
const hmac = (data) => createHmac("sha256", SECRET).update(data).digest("base64url");

/** Comparación en tiempo constante de dos strings. */
function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/** Valida credenciales y devuelve un token de sesión, o null. */
export function login(username, password) {
  if (safeEqual(username, USERNAME) && safeEqual(password, PASSWORD)) {
    const payload = b64(JSON.stringify({ u: USERNAME, exp: Date.now() + TTL_MS }));
    return `${payload}.${hmac(payload)}`;
  }
  return null;
}

/** Verifica un token y devuelve el payload, o null. */
export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = hmac(payload);
  if (!safeEqual(sig, expected)) return null;
  try {
    const obj = JSON.parse(unb64(payload));
    return obj.exp > Date.now() ? obj : null;
  } catch {
    return null;
  }
}

/** Extrae una cookie por nombre de la cabecera Cookie. */
export function readCookie(header, name = COOKIE) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionCookie(token) {
  const maxAge = Math.floor(TTL_MS / 1000);
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge};${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

/** Middleware Express: exige una sesión válida. */
export function authMiddleware(req, res, next) {
  const token = readCookie(req.headers.cookie);
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ message: "No autenticado." });
  req.user = { username: session.u };
  next();
}

/** Middleware Socket.IO: exige una sesión válida en el handshake. */
export function socketAuth(socket, next) {
  const token = readCookie(socket.handshake.headers.cookie);
  if (verifyToken(token)) return next();
  next(new Error("unauthorized"));
}

export const AUTH_USERNAME = USERNAME;
