/**
 * WhatsApp (Baileys) reconnection policy — pure, side-effect-free so it can be
 * reasoned about and unit-tested in isolation.
 *
 * A dropped WhatsApp Web socket is not one thing: some closes are transient
 * (retry with backoff), some mean the credentials are dead (clear them and ask
 * for a fresh QR), and some mean retrying is actively harmful (another session
 * took over, or the account is blocked — stop and alert a human). Reconnecting
 * blindly every 2s, as the naive loop did, hammers WhatsApp and can look like
 * abuse; classifying the close first is what makes the client well-behaved.
 */

/** What to do after a connection close. */
export type ReconnectAction = "clear" | "retry" | "stop";

export interface DisconnectDecision {
  action: ReconnectAction;
  /** Human-readable reason, surfaced to the panel / notifications. */
  reason: string;
  /** Whether this is a normal, expected close (don't alarm the user). */
  expected?: boolean;
}

/**
 * Baileys `DisconnectReason` codes (HTTP-like). Duplicated here as plain numbers
 * so the policy never has to load the ESM-only Baileys package to classify.
 */
export const DISCONNECT = {
  loggedOut: 401,
  forbidden: 403,
  connectionLost: 408, // also `timedOut`
  multideviceMismatch: 411,
  connectionClosed: 428,
  connectionReplaced: 440,
  badSession: 500,
  unavailableService: 503,
  restartRequired: 515,
} as const;

/** Stop retrying after this many consecutive failed reconnects → alert a human. */
export const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Classify a socket close into an action.
 * @param statusCode the Baileys `lastDisconnect.error.output.statusCode`, if any
 */
export function classifyDisconnect(statusCode: number | undefined): DisconnectDecision {
  switch (statusCode) {
    case DISCONNECT.loggedOut:
      return { action: "clear", reason: "Sesión cerrada desde el teléfono. Vuelve a escanear el QR." };
    case DISCONNECT.badSession:
      return { action: "clear", reason: "La sesión guardada está dañada. Vuelve a escanear el QR." };
    case DISCONNECT.multideviceMismatch:
      return { action: "clear", reason: "Desajuste de multidispositivo. Vuelve a vincular escaneando el QR." };
    case DISCONNECT.connectionReplaced:
      return {
        action: "stop",
        reason: "Otra sesión de WhatsApp Web tomó el control. Cierra las demás y reconecta manualmente.",
      };
    case DISCONNECT.forbidden:
      return {
        action: "stop",
        reason: "WhatsApp rechazó la conexión (posible bloqueo de la cuenta). Revisa el número.",
      };
    case DISCONNECT.restartRequired:
      // Baileys asks for a socket restart right after pairing — this is normal.
      return { action: "retry", reason: "Reinicio requerido tras vincular.", expected: true };
    case DISCONNECT.connectionClosed:
    case DISCONNECT.connectionLost:
    case DISCONNECT.unavailableService:
      return { action: "retry", reason: "Conexión perdida; reintentando." };
    default:
      return { action: "retry", reason: "Conexión caída; reintentando." };
  }
}

/**
 * Exponential backoff with full jitter, capped. Attempt is 1-based (the first
 * reconnect after a drop is attempt 1). Jitter avoids a thundering herd when
 * many workspaces drop at once (e.g. the server's network blips).
 */
export function backoffDelay(
  attempt: number,
  opts: { baseMs?: number; capMs?: number; rng?: () => number } = {},
): number {
  const baseMs = opts.baseMs ?? 2000;
  const capMs = opts.capMs ?? 60_000;
  const rng = opts.rng ?? Math.random;
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  // Full jitter: a random point in [base, exp], never below base so we don't
  // spin, never above the cap.
  return Math.min(capMs, Math.round(baseMs + rng() * Math.max(0, exp - baseMs)));
}
