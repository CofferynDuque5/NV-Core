import { describe, expect, it } from "vitest";

import { fold, matches } from "@/lib/search";
import { ago } from "./notifications-panel";

describe("buscador: fold / matches", () => {
  it("ignora tildes y mayúsculas", () => {
    expect(fold("Campaña Ramírez")).toBe("campana ramirez");
    expect(matches("María González", "maria gonz")).toBe(true);
  });

  it("exige que aparezcan todas las palabras, en cualquier orden", () => {
    expect(matches("Promo Black Friday", "friday promo")).toBe(true);
    expect(matches("Promo Black Friday", "promo navidad")).toBe(false);
  });

  it("una búsqueda vacía coincide con todo", () => {
    expect(matches("Lo que sea", "   ")).toBe(true);
  });
});

describe("notificaciones: ago", () => {
  const now = new Date("2026-10-28T12:00:00Z").getTime();
  const before = (ms: number) => new Date(now - ms).toISOString();

  it("dice el tiempo relativo en español", () => {
    expect(ago(before(20_000), now)).toBe("ahora");
    expect(ago(before(5 * 60_000), now)).toBe("hace 5 min");
    expect(ago(before(3 * 3_600_000), now)).toBe("hace 3 h");
    expect(ago(before(30 * 3_600_000), now)).toBe("ayer");
  });

  it("después de dos días muestra la fecha", () => {
    expect(ago(before(5 * 86_400_000), now)).toMatch(/23/);
  });
});
