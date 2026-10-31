import { describe, expect, it } from "vitest";
import { initialsOf } from "@nv/domain";

describe("initialsOf", () => {
  it("uses letters only", () => {
    expect(initialsOf("Visitante (demo)")).toBe("VD");
    expect(initialsOf("Demo · Tienda de ejemplo")).toBe("DT");
    expect(initialsOf("ana.perez@mail.com")).toBe("AP");
    expect(initialsOf("Nathan")).toBe("NA");
    expect(initialsOf("  ")).toBe("NV");
  });
});
