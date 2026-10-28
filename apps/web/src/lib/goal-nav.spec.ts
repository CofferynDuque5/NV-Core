import { describe, expect, it } from "vitest";

import { baseNavSections, goalModules, navSectionsFor } from "./goal-nav";

describe("navSectionsFor", () => {
  it("without goals, the standard menu (with Tienda)", () => {
    const nav = navSectionsFor([]);
    expect(nav).toEqual(baseNavSections());
    expect(nav[0]!.items.map((i) => i.module)).toContain("tienda");
  });

  it("pins the screens of the chosen goals on top, Dashboard first, without repeating them", () => {
    const nav = navSectionsFor(["ventas", "difusion"]);
    expect(nav[0]!.label).toBe("TU OBJETIVO");
    expect(nav[0]!.items.map((i) => i.module)).toEqual([
      "dashboard",
      "tienda",
      "cobros",
      "inbox",
      "campanas",
      "grupos",
      "conexiones",
    ]);
    const rest = nav.slice(1).flatMap((s) => s.items.map((i) => i.module));
    expect(rest).not.toContain("tienda");
    expect(rest).not.toContain("dashboard");
    // MENSAJERÍA only had Inbox: the empty section goes away.
    expect(nav.some((s) => s.label === "MENSAJERÍA")).toBe(false);
    // Nothing is lost.
    expect(nav.flatMap((s) => s.items).length).toBe(baseNavSections().flatMap((s) => s.items).length);
  });

  it("ignores unknown goals", () => {
    expect(goalModules(["nope", "redes"])).toEqual(["calendario", "conexiones", "analytics"]);
  });
});
