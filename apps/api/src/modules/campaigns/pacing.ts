/**
 * Send pacing — anti-ban throttling for bulk campaign delivery.
 *
 * WhatsApp/Telegram flag accounts that blast messages on a clockwork cadence.
 * A fixed 4s gap between every send is exactly that tell. Human-like sending
 * means (a) a RANDOM gap inside a window between each message, and (b) a longer
 * cool-down after every batch, so a 300-group blast looks like someone working
 * through a list, not a script. These functions are pure so the cadence can be
 * reasoned about and unit-tested without real timers.
 */

export interface PacingOptions {
  /** Minimum gap between two sends (ms). */
  minMs: number;
  /** Maximum gap between two sends (ms); the real gap is uniform in [min, max]. */
  maxMs: number;
  /** After this many sends, add a longer cool-down. 0 disables batching. */
  batchSize: number;
  /** Cool-down added after each full batch (ms), itself jittered ±25%. */
  cooldownMs: number;
  /** Injectable RNG for deterministic tests (defaults to Math.random). */
  rng?: () => number;
}

/**
 * The delay to wait AFTER the `sentCount`-th send (1-based) before the next one.
 * A uniform jitter in [min, max], plus a jittered cool-down when `sentCount` is
 * a multiple of `batchSize`.
 */
export function pacingDelay(sentCount: number, o: PacingOptions): number {
  const rng = o.rng ?? Math.random;
  const span = Math.max(0, o.maxMs - o.minMs);
  let delay = Math.round(o.minMs + rng() * span);
  if (o.batchSize > 0 && o.cooldownMs > 0 && sentCount > 0 && sentCount % o.batchSize === 0) {
    // 0.75×–1.25× so even the cool-down isn't a constant.
    delay += Math.round(o.cooldownMs * (0.75 + rng() * 0.5));
  }
  return delay;
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Resolve pacing from environment, with human-like defaults.
 *
 * - `WHATSAPP_SEND_MIN_MS` / `WHATSAPP_SEND_MAX_MS` set the window directly.
 * - Otherwise the window is derived from the legacy `WHATSAPP_GROUP_DELAY_MS`
 *   (default 4000): 0.75×–1.75× of it, so existing installs keep ~4–7s gaps.
 * - `WHATSAPP_GROUP_DELAY_MS=0` disables pacing entirely (min=max=cooldown=0) —
 *   the documented escape hatch (and what the test suite uses).
 * - `WHATSAPP_BATCH_SIZE` (default 20) and `WHATSAPP_COOLDOWN_MS` (default 60000)
 *   control the periodic cool-down.
 */
export function resolvePacing(env: NodeJS.ProcessEnv = process.env): PacingOptions {
  const baseline = num(env.WHATSAPP_GROUP_DELAY_MS) ?? 4000;
  const disabled = baseline === 0;

  let minMs = num(env.WHATSAPP_SEND_MIN_MS);
  let maxMs = num(env.WHATSAPP_SEND_MAX_MS);
  if (minMs === undefined || maxMs === undefined) {
    minMs ??= disabled ? 0 : Math.round(baseline * 0.75);
    maxMs ??= disabled ? 0 : Math.round(baseline * 1.75);
  }
  // Guard against an inverted window.
  if (maxMs < minMs) maxMs = minMs;

  const batchSize = Math.max(0, num(env.WHATSAPP_BATCH_SIZE) ?? 20);
  const cooldownMs = disabled ? 0 : Math.max(0, num(env.WHATSAPP_COOLDOWN_MS) ?? 60_000);

  return { minMs, maxMs, batchSize, cooldownMs };
}

/**
 * Per-account turn: each WhatsApp number / Telegram account sends at most one
 * message every `minGapMs`, across ALL campaigns running at the same time.
 * Without it, two campaigns that start together each keep their own pauses,
 * so the account sends twice as fast as the anti-ban rhythm allows. The turn
 * is reserved synchronously, so concurrent runs queue up in order.
 */
const nextFree = new Map<string, number>();
export function reserveAccountTurn(key: string, minGapMs: number, now = Date.now()): number {
  if (minGapMs <= 0) return 0;
  const at = Math.max(now, nextFree.get(key) ?? 0);
  nextFree.set(key, at + minGapMs);
  return at - now;
}
/** Test helper: forget every account's turn. */
export function resetAccountTurns(): void {
  nextFree.clear();
}

/**
 * The anti-ban rhythm in plain words for `groups` sends, with a rough time:
 * «un mensaje cada 3–7 s, con una pausa de ~1 min cada 20 grupos; tarda unos 3 min».
 */
export function describeSendPace(
  groups: number,
  o: Pick<PacingOptions, "minMs" | "maxMs" | "batchSize" | "cooldownMs">,
  batchSize?: number | null,
  batchPauseMin?: number | null,
): string {
  const s = (ms: number) => Math.max(0, Math.round(ms / 1000));
  if (o.maxMs <= 0 && !batchSize) return "sin pausas entre mensajes (el ritmo anti-ban está desactivado en el servidor).";
  const gap = s(o.minMs) === s(o.maxMs) ? `${s(o.minMs)} s` : `${s(o.minMs)}–${s(o.maxMs)} s`;
  const avgGap = (o.minMs + o.maxMs) / 2;
  let rest: string;
  let restMs: number;
  if (batchSize && batchSize > 0) {
    const min = batchPauseMin ?? 10;
    rest = `en lotes de ${batchSize} grupos con ${min} min de pausa entre lotes`;
    restMs = Math.max(0, Math.ceil(groups / batchSize) - 1) * min * 60_000;
  } else if (o.batchSize > 0 && o.cooldownMs > 0) {
    const m = Math.max(1, Math.round(o.cooldownMs / 60_000));
    rest = `con una pausa de ~${m} min cada ${o.batchSize} grupos`;
    restMs = Math.floor(Math.max(0, groups - 1) / o.batchSize) * o.cooldownMs;
  } else {
    rest = "";
    restMs = 0;
  }
  const total = Math.max(0, groups - 1) * avgGap + restMs;
  const mins = Math.max(1, Math.round(total / 60_000));
  return `un mensaje cada ${gap} por número${rest ? `, ${rest}` : ""}; tarda unos ${mins} min.`;
}
