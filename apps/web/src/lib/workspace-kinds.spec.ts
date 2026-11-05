import { describe, expect, it } from "vitest";
import { KIND_META, WORKSPACE_ACCENTS } from "./workspace-kinds";

describe("tipos de marca", () => {
  it("cada tipo tiene nombre, descripción, color e ícono", () => {
    for (const meta of Object.values(KIND_META)) {
      expect(meta.label).toBeTruthy();
      expect(meta.desc).toBeTruthy();
      expect(meta.accent).toMatch(/^#[0-9A-F]{6}$/i);
      expect(meta.icon).toBeTruthy();
    }
    expect(WORKSPACE_ACCENTS.length).toBeGreaterThan(0);
  });
});
