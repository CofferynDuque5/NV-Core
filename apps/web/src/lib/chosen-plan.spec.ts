import { afterEach, describe, expect, it, vi } from "vitest";

import { chosenPlan, forgetChosenPlan, planFromSearch, rememberChosenPlan } from "./chosen-plan";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("chosen plan", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads only real plans from the query string", () => {
    expect(planFromSearch("?plan=basico")).toBe("basico");
    expect(planFromSearch(new URLSearchParams("plan=PRO"))).toBe("pro");
    expect(planFromSearch("?plan=free")).toBeUndefined();
    expect(planFromSearch("?plan=gold")).toBeUndefined();
    expect(planFromSearch("")).toBeUndefined();
  });

  it("remembers, returns and forgets the choice", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(chosenPlan()).toBeUndefined();
    rememberChosenPlan(undefined);
    expect(chosenPlan()).toBeUndefined();
    rememberChosenPlan("basico");
    expect(chosenPlan()).toBe("basico");
    forgetChosenPlan();
    expect(chosenPlan()).toBeUndefined();
  });

  it("ignores a tampered value", () => {
    const store = memoryStorage();
    store.setItem("nv-plan-elegido", "gratis-para-siempre");
    vi.stubGlobal("localStorage", store);
    expect(chosenPlan()).toBeUndefined();
  });

  it("survives blocked storage", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    expect(() => rememberChosenPlan("pro")).not.toThrow();
    expect(chosenPlan()).toBeUndefined();
    expect(() => forgetChosenPlan()).not.toThrow();
  });
});
