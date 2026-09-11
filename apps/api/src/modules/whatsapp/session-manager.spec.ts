import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LOCK_TTL_MS, SessionManager } from "./session-manager";

/**
 * Cross-process bits of the session store: the shared QR file and the
 * single-owner lock. These are what let a hosting that runs several copies of
 * the app (Passenger/LiteSpeed) still show the QR and never open the same
 * WhatsApp session twice.
 */
let base: string;
let sm: SessionManager;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "nv-wa-"));
  sm = new SessionManager(base);
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe("SessionManager QR file", () => {
  it("round-trips the QR and clears it", () => {
    sm.saveQr("ws", "data:image/png;base64,AAA");
    expect(sm.readQr("ws")).toBe("data:image/png;base64,AAA");
    sm.clearQr("ws");
    expect(sm.readQr("ws")).toBeNull();
  });

  it("is null when nothing was saved", () => {
    expect(sm.readQr("nope")).toBeNull();
  });
});

describe("SessionManager owner lock", () => {
  it("acquires when free and reports itself as owner", () => {
    expect(sm.acquireLock("ws")).toBe(true);
    const o = sm.lockOwner("ws");
    expect(o?.mine).toBe(true);
    expect(o?.fresh).toBe(true);
  });

  it("refuses when another live process holds a fresh lock", () => {
    // Our own parent process is alive and is not us.
    writeFileSync(
      join(sm.dirFor("ws"), "owner.json"),
      JSON.stringify({ pid: process.ppid, at: Date.now() }),
    );
    expect(sm.acquireLock("ws")).toBe(false);
    expect(sm.lockOwner("ws")?.mine).toBe(false);
  });

  it("takes over a stale lock (heartbeat too old) or a dead pid", () => {
    writeFileSync(
      join(sm.dirFor("ws"), "owner.json"),
      JSON.stringify({ pid: process.ppid, at: Date.now() - LOCK_TTL_MS - 1 }),
    );
    expect(sm.acquireLock("ws")).toBe(true);

    writeFileSync(join(sm.dirFor("ws2"), "owner.json"), JSON.stringify({ pid: 999999999, at: Date.now() }));
    expect(sm.acquireLock("ws2")).toBe(true);
  });

  it("only releases its own lock, and deleteSession keeps it", () => {
    sm.acquireLock("ws");
    writeFileSync(join(sm.dirFor("ws"), "creds.json"), "{}");
    sm.deleteSession("ws");
    expect(sm.hasSession("ws")).toBe(false);
    expect(sm.lockOwner("ws")?.mine).toBe(true);
    sm.releaseLock("ws");
    expect(sm.lockOwner("ws")).toBeNull();

    writeFileSync(join(sm.dirFor("other"), "owner.json"), JSON.stringify({ pid: process.ppid, at: Date.now() }));
    sm.releaseLock("other");
    expect(sm.lockOwner("other")).not.toBeNull();
  });
});
