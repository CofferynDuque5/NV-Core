/**
 * Reconoce los errores que significan «la base de datos no está disponible»
 * (no un fallo del panel) y los traduce a un mensaje claro en español.
 *
 * Caso real (27/11/2026): el proyecto gratis de Neon agotó su cuota mensual y
 * cada pantalla mostraba el error crudo de Prisma o se quedaba cargando.
 */
export type DatabaseOutage = {
  /** "quota": el proveedor bloqueó el proyecto por límite de plan; "unreachable": no responde. */
  reason: "quota" | "unreachable";
  message: string;
};

export const DB_QUOTA_MESSAGE =
  "El panel no puede abrir la base de datos: el proveedor (Neon o Supabase) bloqueó el proyecto porque superó el límite de su plan gratis. Vuelve a funcionar al subir de plan, al reactivar el proyecto o cuando se reinicie la cuota del mes. Tus datos no se pierden.";

export const DB_UNREACHABLE_MESSAGE =
  "El panel no puede conectar con la base de datos en este momento. Revisa que tu proyecto de Neon o Supabase esté activo y vuelve a intentarlo en unos minutos. Tus datos no se pierden.";

// Códigos de Prisma de conexión: P1000 credenciales, P1001 no alcanza el
// servidor, P1002 tiempo agotado, P1008 operación agotada, P1017 el servidor
// cerró la conexión, P2024 no hubo conexión libre a tiempo.
const CONNECTION_CODES = new Set(["P1000", "P1001", "P1002", "P1008", "P1017", "P2024"]);

const QUOTA_PATTERNS = [
  /exceeded the (compute time |data transfer |)quota/i,
  /exceeded the quota/i,
  /project (is|has been) (paused|suspended)/i,
];

const UNREACHABLE_PATTERNS = [
  /can't reach database server/i,
  /timed out fetching a new connection/i,
  /server has closed the connection/i,
  /connection (terminated|refused|timeout)/i,
  /tenant or user not found/i, // Supabase: proyecto pausado o borrado
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/,
];

export function detectDatabaseOutage(exception: unknown): DatabaseOutage | null {
  if (!exception || typeof exception !== "object") return null;
  const err = exception as { name?: unknown; message?: unknown; code?: unknown; errorCode?: unknown };
  const message = typeof err.message === "string" ? err.message : "";
  const code = String(err.errorCode ?? err.code ?? "");
  // Solo errores de Prisma: un ECONNREFUSED de otra integración (IA, Meta…)
  // no es un problema de la base de datos.
  const fromPrisma = typeof err.name === "string" && err.name.startsWith("PrismaClient");
  if (!fromPrisma && !CONNECTION_CODES.has(code)) return null;
  if (QUOTA_PATTERNS.some((re) => re.test(message))) {
    return { reason: "quota", message: DB_QUOTA_MESSAGE };
  }
  const isInit = err.name === "PrismaClientInitializationError";
  if (isInit || CONNECTION_CODES.has(code) || UNREACHABLE_PATTERNS.some((re) => re.test(message))) {
    return { reason: "unreachable", message: DB_UNREACHABLE_MESSAGE };
  }
  return null;
}
