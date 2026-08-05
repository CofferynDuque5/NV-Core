import { describe, expect, it } from "vitest";
import type { Design, DesignLayer } from "@nv/domain";

import {
  addLayer,
  duplicateLayer,
  formatSpec,
  lower,
  moveLayer,
  nextId,
  raise,
  removeLayer,
  resizeLayer,
  toBack,
  toFront,
  toSvg,
  updateLayer,
} from "./design";

const layer = (over: Partial<DesignLayer> = {}): DesignLayer => ({
  id: "l1",
  type: "text",
  x: 0,
  y: 0,
  w: 100,
  h: 40,
  ...over,
});

describe("formatSpec", () => {
  it("returns canvas dimensions per format", () => {
    expect(formatSpec("square")).toMatchObject({ w: 1080, h: 1080 });
    expect(formatSpec("story")).toMatchObject({ w: 1080, h: 1920 });
  });
});

describe("nextId", () => {
  it("increments past the highest id", () => {
    expect(nextId("l", [{ id: "l1" }, { id: "l5" }])).toBe("l6");
    expect(nextId("l", [])).toBe("l1");
  });
});

describe("addLayer", () => {
  it("adds a centered preset on top", () => {
    const out = addLayer([], "title", "square");
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe("text");
    expect(out[0]!.id).toBe("l1");
  });
  it("puts a background full-canvas and at the bottom", () => {
    const withTitle = addLayer([], "title", "square");
    const withBg = addLayer(withTitle, "bg", "square");
    expect(withBg[0]!.type).toBe("rect"); // bg first (bottom)
    expect(withBg[0]!.w).toBe(1080);
    expect(withBg[0]!.h).toBe(1080);
  });
  it("ignores an unknown preset", () => {
    expect(addLayer([], "nope", "square")).toHaveLength(0);
  });
});

describe("updateLayer / removeLayer / duplicateLayer", () => {
  it("patches immutably", () => {
    const out = updateLayer([layer()], "l1", { text: "Hola" });
    expect(out[0]!.text).toBe("Hola");
  });
  it("removes by id", () => {
    expect(removeLayer([layer()], "l1")).toHaveLength(0);
  });
  it("duplicates with a new id and offset", () => {
    const out = duplicateLayer([layer({ x: 10, y: 10 })], "l1");
    expect(out).toHaveLength(2);
    expect(out[1]!.id).toBe("l2");
    expect(out[1]!.x).toBe(34);
  });
});

describe("moveLayer", () => {
  it("clamps so the layer stays partly on canvas", () => {
    const out = moveLayer([layer({ w: 100, h: 40 })], "l1", -500, 99999, "square");
    expect(out[0]!.x).toBe(-76); // -w + MIN(24)
    expect(out[0]!.y).toBe(1056); // canvasH - MIN
  });
});

describe("resizeLayer", () => {
  it("enforces a minimum size", () => {
    const out = resizeLayer([layer()], "l1", 5, 5);
    expect(out[0]!.w).toBe(24);
    expect(out[0]!.h).toBe(24);
  });
});

describe("z-order", () => {
  const three = [layer({ id: "a" }), layer({ id: "b" }), layer({ id: "c" })];
  it("raise/lower swap neighbors", () => {
    expect(raise(three, "a").map((l) => l.id)).toEqual(["b", "a", "c"]);
    expect(lower(three, "c").map((l) => l.id)).toEqual(["a", "c", "b"]);
  });
  it("raise on top / lower on bottom are no-ops", () => {
    expect(raise(three, "c").map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(lower(three, "a").map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
  it("toFront / toBack move to the ends", () => {
    expect(toFront(three, "a").map((l) => l.id)).toEqual(["b", "c", "a"]);
    expect(toBack(three, "c").map((l) => l.id)).toEqual(["c", "a", "b"]);
  });
});

describe("toSvg", () => {
  const design: Design = {
    id: "d1",
    name: "x",
    format: "square",
    layers: [
      layer({ id: "bg", type: "rect", w: 1080, h: 1080, fill: "#111" }),
      layer({ id: "t", type: "text", text: "Hola <b>", x: 40, y: 40, fontSize: 60 }),
      layer({ id: "btn", type: "button", text: "Ir", fill: "#5B8DEF" }),
    ],
  };
  it("emits an svg with the right viewBox and one node per layer", () => {
    const svg = toSvg(design);
    expect(svg).toContain('viewBox="0 0 1080 1080"');
    expect(svg).toContain("<rect");
    expect(svg).toContain("<text");
  });
  it("escapes text content", () => {
    const svg = toSvg(design);
    expect(svg).toContain("Hola &lt;b&gt;");
    expect(svg).not.toContain("Hola <b>");
  });
});
