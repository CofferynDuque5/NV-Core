import { beforeEach, describe, expect, it } from "vitest";

import {
  TOURS,
  completedTours,
  getTour,
  isTourCompleted,
  markTourCompleted,
  positionTooltip,
  type Box,
} from "./tours";

/** In-memory storage stand-in (vitest runs in a node env, no localStorage). */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const VP = { width: 1000, height: 800 };
const TIP = { width: 300, height: 160 };

describe("positionTooltip", () => {
  const target: Box = { top: 400, left: 400, width: 100, height: 40 };

  it("places below the target for 'bottom'", () => {
    const p = positionTooltip(target, "bottom", TIP, VP);
    expect(p.placement).toBe("bottom");
    expect(p.top).toBe(400 + 40 + 12);
    expect(p.left).toBe(400 + 50 - 150); // centered on target
  });

  it("flips to 'top' when there's no room below", () => {
    const low: Box = { top: 760, left: 400, width: 100, height: 30 };
    const p = positionTooltip(low, "bottom", TIP, VP);
    expect(p.placement).toBe("top");
  });

  it("flips 'right' to 'left' when it would overflow the right edge", () => {
    const nearRight: Box = { top: 300, left: 950, width: 40, height: 40 };
    const p = positionTooltip(nearRight, "right", TIP, VP);
    expect(p.placement).toBe("left");
  });

  it("clamps within the viewport margin", () => {
    const corner: Box = { top: 10, left: 10, width: 20, height: 20 };
    const p = positionTooltip(corner, "left", TIP, VP);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.left + TIP.width).toBeLessThanOrEqual(VP.width - 8 + 0.001);
  });
});

describe("tour catalog", () => {
  it("has a primeros-pasos tour with steps", () => {
    const t = getTour("primeros-pasos");
    expect(t).toBeDefined();
    expect(t!.steps.length).toBeGreaterThan(2);
  });

  it("every targeted step uses a data-tour selector", () => {
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        if (step.target) expect(step.target).toMatch(/^\[data-tour="[\w-]+"\]$/);
      }
    }
  });
});

describe("completion state", () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it("starts empty", () => {
    expect(completedTours(storage)).toEqual([]);
    expect(isTourCompleted("primeros-pasos", storage)).toBe(false);
  });

  it("marks a tour completed (idempotent)", () => {
    markTourCompleted("primeros-pasos", storage);
    markTourCompleted("primeros-pasos", storage);
    expect(completedTours(storage)).toEqual(["primeros-pasos"]);
    expect(isTourCompleted("primeros-pasos", storage)).toBe(true);
  });

  it("tolerates corrupt storage", () => {
    storage.setItem("nv.tours.completed", "not json");
    expect(completedTours(storage)).toEqual([]);
  });
});
