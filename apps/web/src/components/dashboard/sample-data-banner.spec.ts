import { describe, expect, it } from "vitest";

import { describeSample } from "./sample-data-banner";

describe("describeSample", () => {
  it("lista solo lo que queda, en singular o plural", () => {
    expect(describeSample({ contacts: 10, automations: 1, funnels: 2, forms: 0 })).toBe(
      "10 contactos, 1 automatización y 2 embudos",
    );
  });

  it("un solo tipo no lleva «y»", () => {
    expect(describeSample({ segments: 1 })).toBe("1 segmento");
  });
});
