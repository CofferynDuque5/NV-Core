import { describe, expect, it } from "vitest";

import { pacingDelay, resolvePacing, type PacingOptions } from "./pacing";

const base: PacingOptions = { minMs: 3000, maxMs: 7000, batchSize: 20, cooldownMs: 60_000 };

describe("pacingDelay", () => {
  it("returns the low end of the window when rng=0", () => {
    expect(pacingDelay(1, { ...base, rng: () => 0 })).toBe(3000);
  });

  it("returns the high end of the window when rng=1 (no batch boundary)", () => {
    expect(pacingDelay(1, { ...base, rng: () => 1 })).toBe(7000);
  });

  it("stays within [min, max] off batch boundaries for any rng", () => {
    for (const r of [0, 0.1, 0.37, 0.5, 0.9, 1]) {
      const d = pacingDelay(3, { ...base, rng: () => r });
      expect(d).toBeGreaterThanOrEqual(3000);
      expect(d).toBeLessThanOrEqual(7000);
    }
  });

  it("adds a cool-down on batch boundaries", () => {
    // sentCount=20 is a multiple of batchSize → base gap + cooldown.
    const d = pacingDelay(20, { ...base, rng: () => 0 });
    // rng=0 → gap=min(3000) + cooldown*0.75 (45000) = 48000.
    expect(d).toBe(3000 + 45_000);
    expect(d).toBeGreaterThan(base.maxMs);
  });

  it("does not add a cool-down when batching is disabled", () => {
    const d = pacingDelay(20, { ...base, batchSize: 0, rng: () => 1 });
    expect(d).toBe(7000);
  });
});

describe("resolvePacing", () => {
  it("derives a jittered window from the legacy fixed delay", () => {
    const p = resolvePacing({ WHATSAPP_GROUP_DELAY_MS: "4000" } as NodeJS.ProcessEnv);
    expect(p.minMs).toBe(3000); // 0.75×
    expect(p.maxMs).toBe(7000); // 1.75×
    expect(p.batchSize).toBe(20);
  });

  it("disables pacing entirely when the legacy delay is 0 (escape hatch)", () => {
    const p = resolvePacing({ WHATSAPP_GROUP_DELAY_MS: "0" } as NodeJS.ProcessEnv);
    expect(p).toMatchObject({ minMs: 0, maxMs: 0, cooldownMs: 0 });
    // With a zero window the delay is always 0, even on a batch boundary.
    expect(pacingDelay(20, { ...p, rng: () => 1 })).toBe(0);
  });

  it("honors an explicit min/max window and batch settings", () => {
    const p = resolvePacing({
      WHATSAPP_SEND_MIN_MS: "5000",
      WHATSAPP_SEND_MAX_MS: "12000",
      WHATSAPP_BATCH_SIZE: "50",
      WHATSAPP_COOLDOWN_MS: "120000",
    } as NodeJS.ProcessEnv);
    expect(p).toEqual({ minMs: 5000, maxMs: 12_000, batchSize: 50, cooldownMs: 120_000 });
  });

  it("uses sane defaults when nothing is set", () => {
    const p = resolvePacing({} as NodeJS.ProcessEnv);
    expect(p.minMs).toBe(3000);
    expect(p.maxMs).toBe(7000);
  });

  it("corrects an inverted window", () => {
    const p = resolvePacing({
      WHATSAPP_SEND_MIN_MS: "9000",
      WHATSAPP_SEND_MAX_MS: "2000",
    } as NodeJS.ProcessEnv);
    expect(p.maxMs).toBe(p.minMs);
  });
});
