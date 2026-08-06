import { describe, expect, it } from "vitest";

import { FORMATS, LENGTHS, mergeHashtags, wordCount } from "./ai-studio";

describe("presets", () => {
  it("expose stable ids", () => {
    expect(FORMATS.map((f) => f.id)).toContain("caption");
    expect(LENGTHS.map((l) => l.id)).toEqual(["corto", "medio", "largo"]);
  });
});

describe("mergeHashtags", () => {
  it("appends new hashtags on a fresh line", () => {
    expect(mergeHashtags("Gran oferta", ["#verano", "#promo"])).toBe("Gran oferta\n\n#verano #promo");
  });
  it("skips hashtags already present (case-insensitive)", () => {
    expect(mergeHashtags("Hola #Verano", ["#verano", "#nuevo"])).toBe("Hola #Verano\n\n#nuevo");
  });
  it("is a no-op when all tags exist", () => {
    expect(mergeHashtags("x #a #b", ["#a", "#b"])).toBe("x #a #b");
  });
  it("handles empty base text", () => {
    expect(mergeHashtags("", ["#a"])).toBe("#a");
  });
  it("trims tags and drops empties", () => {
    expect(mergeHashtags("hola", ["  #x ", "  "])).toBe("hola\n\n#x");
  });
});

describe("wordCount", () => {
  it("counts words, tolerating extra whitespace", () => {
    expect(wordCount("  hola   mundo  ")).toBe(2);
    expect(wordCount("")).toBe(0);
  });
});
