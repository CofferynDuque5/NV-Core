import { describe, expect, it } from "vitest";
import type { Product } from "@nv/domain";

import { filterProducts, priceLine, productCategories, productMessage, STORE_CURRENCIES } from "./products";

const product = (over: Partial<Product> = {}): Product => ({
  id: "p1",
  name: "Combo Netflix",
  description: "Pantalla 1 mes",
  category: "Streaming",
  prices: {},
  images: [],
  sku: null,
  stock: null,
  active: true,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("Tienda helpers", () => {
  it("shows every price in its currency, common ones first", () => {
    expect(STORE_CURRENCIES.slice(0, 4)).toEqual(["USD", "VES", "COP", "EUR"]);
    expect(priceLine(product({ prices: { EUR: "6", VES: "350" } }))).toBe("Bs 350 · 6 €");
    expect(priceLine(product())).toBe("");
  });

  it("filters by text without accents, category and status", () => {
    const items = [
      product(),
      product({ id: "p2", name: "Cámara", description: null, category: "Equipos", active: false }),
    ];
    expect(filterProducts(items, { q: "camara" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filterProducts(items, { category: "Streaming" }).map((p) => p.id)).toEqual(["p1"]);
    expect(filterProducts(items, { status: "pausados" }).map((p) => p.id)).toEqual(["p2"]);
    expect(productCategories(items)).toEqual(["Equipos", "Streaming"]);
  });

  it("builds a campaign message with {{precio}}", () => {
    expect(productMessage(product())).toBe("*Combo Netflix*\nPantalla 1 mes\nPrecio: {{precio}}");
  });
});
