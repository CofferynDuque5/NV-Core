import { describe, expect, it } from "vitest";

import { campaignItems, cleanItems, itemsHaveImage, MAX_CAMPAIGN_ITEMS } from "./campaign-items";

describe("cleanItems", () => {
  it("keeps text, one image and the prices of each product", () => {
    const out = cleanItems([
      {
        productId: "p1",
        name: " Pantalla ",
        text: " Pantalla a {{precio}} ",
        attachments: [
          { url: "https://x/a.jpg", kind: "image" },
          { url: "https://x/b.jpg", kind: "image" },
        ],
        prices: { USD: 4, VES: " 160 ", bad: "1" },
      },
    ])!;
    expect(out).toEqual([
      {
        productId: "p1",
        name: "Pantalla",
        text: "Pantalla a {{precio}}",
        attachments: [{ url: "https://x/a.jpg", kind: "image", mime: null, filename: null, path: undefined }],
        prices: { USD: "4", VES: "160" },
      },
    ]);
    expect(itemsHaveImage(out)).toBe(true);
  });

  it("refuses an empty product and too many products", () => {
    expect(() => cleanItems([{ name: "Vacío", text: "  " }])).toThrow(/Vacío/);
    expect(() => cleanItems(Array.from({ length: MAX_CAMPAIGN_ITEMS + 1 }, () => ({ text: "x" })))).toThrow(/hasta/);
    expect(cleanItems(undefined)).toBeUndefined();
  });

  it("reads stored rows safely", () => {
    expect(campaignItems(null)).toEqual([]);
    expect(itemsHaveImage(campaignItems([{ name: "a", text: "b" }]))).toBe(false);
  });
});
