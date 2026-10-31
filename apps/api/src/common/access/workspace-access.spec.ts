import { describe, expect, it } from "vitest";

import { OPEN_WHEN_EXPIRED, accessState, effectivePlan, extendPaidUntil, planLimits, routeSection } from "./workspace-access";

const now = new Date("2026-10-27T12:00:00Z");
const h = (n: number) => new Date(now.getTime() + n * 3_600_000);

describe("accessState", () => {
  it("una marca sin fila (de fábrica u operador) nunca se bloquea", () => {
    expect(accessState(null, now)).toEqual({ state: "unlimited" });
  });

  it("está en prueba hasta la hora exacta y luego vence", () => {
    expect(accessState({ trialEndsAt: h(1), paidUntil: null }, now).state).toBe("trial");
    expect(accessState({ trialEndsAt: now, paidUntil: null }, now).state).toBe("expired");
    expect(accessState({ trialEndsAt: h(-1), paidUntil: null }, now)).toEqual({
      state: "expired",
      trialEndsAt: h(-1).toISOString(),
    });
  });

  it("el tiempo pagado manda sobre la prueba, y también vence", () => {
    expect(accessState({ trialEndsAt: h(-48), paidUntil: h(5) }, now).state).toBe("active");
    expect(accessState({ trialEndsAt: h(-48), paidUntil: h(-5) }, now).state).toBe("expired");
  });
});

describe("extendPaidUntil", () => {
  it("suma desde hoy si ya venció y desde el final si aún quedaban días", () => {
    expect(extendPaidUntil(null, 30, now).toISOString()).toBe("2026-11-26T12:00:00.000Z");
    expect(extendPaidUntil(h(-10), 30, now).toISOString()).toBe("2026-11-26T12:00:00.000Z");
    expect(extendPaidUntil(h(24), 30, now).toISOString()).toBe("2026-11-27T12:00:00.000Z");
  });
});

describe("routeSection", () => {
  it("devuelve la sección de la ruta de la marca", () => {
    expect(routeSection("/api/workspaces/mi-marca/contacts?x=1", "mi-marca")).toBe("contacts");
    expect(routeSection("/api/workspaces/mi-marca/access/pay", "mi-marca")).toBe("access");
    expect(routeSection("/api/workspaces/mi-marca", "mi-marca")).toBeUndefined();
    expect(routeSection("/api/workspaces/otra/contacts", "mi-marca")).toBeUndefined();
  });

  it("solo deja abiertos el plan y la facturación", () => {
    expect([...OPEN_WHEN_EXPIRED].sort()).toEqual(["access", "billing"]);
  });
});

describe("effectivePlan / planLimits", () => {
  const past = new Date(now.getTime() - 3_600_000);
  const future = new Date(now.getTime() + 86_400_000);

  it("sin fila no hay plan ni límites", () => {
    expect(effectivePlan(null, now)).toBeUndefined();
    expect(planLimits(null, now)).toBeUndefined();
  });

  it("la prueba tiene todo lo de Pro", () => {
    expect(effectivePlan({ trialEndsAt: future, paidUntil: null }, now)).toBe("pro");
  });

  it("pagado: el plan elegido; pagos de antes de los planes son Pro", () => {
    expect(effectivePlan({ trialEndsAt: past, paidUntil: future, planId: "basico" }, now)).toBe("basico");
    expect(effectivePlan({ trialEndsAt: past, paidUntil: future, planId: null }, now)).toBe("pro");
    expect(planLimits({ trialEndsAt: past, paidUntil: future, planId: "basico" }, now)).toEqual({
      whatsappNumbers: 1,
      telegramAccounts: 1,
      brands: 1,
    });
  });
});
