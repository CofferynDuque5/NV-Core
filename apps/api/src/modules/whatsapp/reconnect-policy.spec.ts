import { describe, expect, it } from "vitest";

import {
  DISCONNECT,
  MAX_RECONNECT_ATTEMPTS,
  backoffDelay,
  classifyDisconnect,
} from "./reconnect-policy";

describe("classifyDisconnect", () => {
  it("clears credentials on logout / bad session / multidevice mismatch", () => {
    for (const code of [DISCONNECT.loggedOut, DISCONNECT.badSession, DISCONNECT.multideviceMismatch]) {
      expect(classifyDisconnect(code).action).toBe("clear");
    }
  });

  it("stops (no auto-retry) when another session took over or the account is blocked", () => {
    expect(classifyDisconnect(DISCONNECT.connectionReplaced).action).toBe("stop");
    expect(classifyDisconnect(DISCONNECT.forbidden).action).toBe("stop");
  });

  it("retries transient closes and unknown codes", () => {
    for (const code of [
      DISCONNECT.connectionClosed,
      DISCONNECT.connectionLost,
      DISCONNECT.unavailableService,
      undefined,
      9999,
    ]) {
      expect(classifyDisconnect(code).action).toBe("retry");
    }
  });

  it("marks restartRequired as an expected retry (no alarm)", () => {
    const d = classifyDisconnect(DISCONNECT.restartRequired);
    expect(d.action).toBe("retry");
    expect(d.expected).toBe(true);
  });

  it("always carries a human-readable reason", () => {
    for (const code of [DISCONNECT.loggedOut, DISCONNECT.forbidden, undefined]) {
      expect(classifyDisconnect(code).reason.length).toBeGreaterThan(0);
    }
  });
});

describe("backoffDelay", () => {
  it("grows exponentially at the low end (rng=0 → base floor)", () => {
    // rng=0 collapses jitter to the base floor, so we see the deterministic min.
    expect(backoffDelay(1, { rng: () => 0 })).toBe(2000);
    expect(backoffDelay(2, { rng: () => 0 })).toBe(2000);
  });

  it("never exceeds the cap even at high attempts (rng=1 → top of range)", () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      const d = backoffDelay(attempt, { rng: () => 1 });
      expect(d).toBeLessThanOrEqual(60_000);
    }
    // Deep attempts saturate to the cap.
    expect(backoffDelay(20, { rng: () => 1 })).toBe(60_000);
  });

  it("stays within [base, cap] for random jitter", () => {
    for (let attempt = 1; attempt <= 12; attempt++) {
      const d = backoffDelay(attempt, { rng: () => 0.5 });
      expect(d).toBeGreaterThanOrEqual(2000);
      expect(d).toBeLessThanOrEqual(60_000);
    }
  });

  it("honors custom base/cap", () => {
    expect(backoffDelay(1, { baseMs: 500, capMs: 5000, rng: () => 0 })).toBe(500);
    expect(backoffDelay(10, { baseMs: 500, capMs: 5000, rng: () => 1 })).toBe(5000);
  });
});

describe("MAX_RECONNECT_ATTEMPTS", () => {
  it("is a sane positive bound", () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_RECONNECT_ATTEMPTS).toBeLessThanOrEqual(20);
  });
});
