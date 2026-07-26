import { describe, expect, it } from "vitest";

import { slugify } from "./workspace-registry.service";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Mi Nueva Marca")).toBe("mi-nueva-marca");
  });

  it("strips accents/diacritics", () => {
    expect(slugify("Diseño Créativo")).toBe("diseno-creativo");
  });

  it("collapses non-alphanumerics and trims edges", () => {
    expect(slugify("  Hello, World!! ")).toBe("hello-world");
    expect(slugify("A & B / C")).toBe("a-b-c");
  });

  it("returns empty for input with no usable characters", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});
