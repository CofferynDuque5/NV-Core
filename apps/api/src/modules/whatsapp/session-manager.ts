import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

/**
 * File-based WhatsApp session store. Baileys writes credentials + keys under
 * `<baseDir>/<workspaceSlug>/`; this manager owns those paths and their lifecycle.
 *
 * It also keeps two small side files per workspace so that a hosting that runs
 * SEVERAL copies of the app (Passenger/LiteSpeed spawn one process per burst of
 * requests) still behaves like one:
 *  - `qr.txt`   → the last QR (data URL) emitted by whichever process owns the
 *                 socket, so any process can serve it over HTTP.
 *  - `owner.json` → {pid, at} heartbeat of the process that owns the socket, so
 *                 two processes never open the same WhatsApp session at once
 *                 (WhatsApp closes both with "connection replaced").
 */
export class SessionManager {
  private readonly base: string;

  constructor(baseDir: string) {
    this.base = resolve(baseDir);
    mkdirSync(this.base, { recursive: true });
  }

  /** Absolute session directory for a workspace (created on demand). */
  dirFor(workspaceSlug: string): string {
    const dir = join(this.base, sanitize(workspaceSlug));
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** True when a workspace already has stored credentials (i.e. was linked). */
  hasSession(workspaceSlug: string): boolean {
    return existsSync(join(this.base, sanitize(workspaceSlug), "creds.json"));
  }

  /** Workspace slugs that currently have stored credentials. */
  listSessions(): string[] {
    if (!existsSync(this.base)) return [];
    return readdirSync(this.base).filter(
      (name) =>
        safeIsDir(join(this.base, name)) && existsSync(join(this.base, name, "creds.json")),
    );
  }

  /** Remove a workspace's stored credentials (on logout / dead session). Keeps the lock. */
  deleteSession(workspaceSlug: string): void {
    const dir = join(this.base, sanitize(workspaceSlug));
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name === LOCK_FILE) continue;
      rmSync(join(dir, name), { recursive: true, force: true });
    }
  }

  // ── QR shared across processes ─────────────────────────────────────────────
  saveQr(workspaceSlug: string, dataUrl: string): void {
    try {
      writeFileSync(join(this.dirFor(workspaceSlug), QR_FILE), dataUrl, "utf8");
    } catch {
      /* best-effort */
    }
  }

  readQr(workspaceSlug: string): string | null {
    try {
      const file = join(this.base, sanitize(workspaceSlug), QR_FILE);
      if (!existsSync(file)) return null;
      // A QR older than a couple of minutes is expired on WhatsApp's side anyway.
      if (Date.now() - statSync(file).mtimeMs > QR_TTL_MS) return null;
      return readFileSync(file, "utf8") || null;
    } catch {
      return null;
    }
  }

  clearQr(workspaceSlug: string): void {
    rmSync(join(this.base, sanitize(workspaceSlug), QR_FILE), { force: true });
  }

  // ── Single-owner lock ──────────────────────────────────────────────────────
  /** Who (pid) currently owns the socket for this workspace, if the lock is fresh and alive. */
  lockOwner(workspaceSlug: string): LockOwner | null {
    try {
      const file = join(this.base, sanitize(workspaceSlug), LOCK_FILE);
      if (!existsSync(file)) return null;
      const raw = JSON.parse(readFileSync(file, "utf8")) as { pid?: number; at?: number };
      const pid = Number(raw.pid);
      const at = Number(raw.at);
      if (!pid || !at) return null;
      const fresh = Date.now() - at < LOCK_TTL_MS;
      return { pid, at, fresh: fresh && isAlive(pid), mine: pid === process.pid };
    } catch {
      return null;
    }
  }

  /**
   * Try to take the lock for this process. Succeeds when nobody holds it, when
   * the holder is this process, or when the holder died / stopped heartbeating.
   */
  acquireLock(workspaceSlug: string): boolean {
    const owner = this.lockOwner(workspaceSlug);
    if (owner && owner.fresh && !owner.mine) return false;
    this.touchLock(workspaceSlug);
    return true;
  }

  /** Heartbeat: keep the lock fresh while the socket lives in this process. */
  touchLock(workspaceSlug: string): void {
    try {
      writeFileSync(
        join(this.dirFor(workspaceSlug), LOCK_FILE),
        JSON.stringify({ pid: process.pid, at: Date.now() }),
        "utf8",
      );
    } catch {
      /* best-effort */
    }
  }

  /** Release the lock, but only if this process owns it. */
  releaseLock(workspaceSlug: string): void {
    const owner = this.lockOwner(workspaceSlug);
    if (owner && !owner.mine) return;
    rmSync(join(this.base, sanitize(workspaceSlug), LOCK_FILE), { force: true });
  }
}

export interface LockOwner {
  pid: number;
  at: number;
  /** Heartbeat recent AND the process still exists. */
  fresh: boolean;
  mine: boolean;
}

const QR_FILE = "qr.txt";
const LOCK_FILE = "owner.json";
/** Heartbeat interval is 20 s; a lock older than this is considered abandoned. */
export const LOCK_TTL_MS = 60_000;
const QR_TTL_MS = 3 * 60_000;

/** Keep slugs to a safe, single path segment. */
export function sanitize(slug: string): string {
  return slug.replace(/[^a-z0-9_-]/gi, "").slice(0, 64) || "default";
}

function safeIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Whether a pid exists (signal 0 = probe only). EPERM means it exists but isn't ours. */
function isAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
