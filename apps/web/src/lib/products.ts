import { CURRENCY_LABEL, PRICE_CURRENCIES, formatPrice, type Product } from "@nv/domain";

/** Currencies in the order the Tienda shows them: the common ones first. */
export const STORE_CURRENCIES = [
  "USD",
  "VES",
  "COP",
  "EUR",
  ...PRICE_CURRENCIES.filter((c) => !["USD", "VES", "COP", "EUR"].includes(c)),
].filter((c, i, all) => PRICE_CURRENCIES.includes(c) && all.indexOf(c) === i);

export const currencyLabel = (c: string) => CURRENCY_LABEL[c] ?? c;

/** "Bs 350 · $ 10 USD" — every price the product has, in display form. */
export function priceLine(p: Pick<Product, "prices">): string {
  return STORE_CURRENCIES.filter((c) => p.prices[c]?.trim())
    .map((c) => formatPrice(p.prices[c]!, c))
    .join(" · ");
}

/** Sorted, de-duplicated categories used in the catalog. */
export function productCategories(items: Product[]): string[] {
  return [
    ...new Set(items.map((p) => p.category?.trim()).filter((c): c is string => Boolean(c))),
  ].sort((a, b) => a.localeCompare(b, "es"));
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Search by name, description, category or SKU (accent-insensitive), then category and status. */
export function filterProducts(
  items: Product[],
  opts: { q?: string; category?: string; status?: "" | "activos" | "pausados" } = {},
): Product[] {
  const q = fold((opts.q ?? "").trim());
  return items.filter((p) => {
    if (opts.category && p.category !== opts.category) return false;
    if (opts.status === "activos" && !p.active) return false;
    if (opts.status === "pausados" && p.active) return false;
    if (!q) return true;
    return fold(`${p.name} ${p.description ?? ""} ${p.category ?? ""} ${p.sku ?? ""}`).includes(q);
  });
}

/**
 * A ready-to-send campaign message for a product. {{precio}} becomes the
 * price in each group's currency when the campaign is sent.
 */
export function productMessage(p: Pick<Product, "name" | "description">): string {
  return [`*${p.name}*`, p.description?.trim(), "Precio: {{precio}}"].filter(Boolean).join("\n");
}

/** At or below this stock a product shows «Quedan N» and appears in the low-stock notice. */
export const LOW_STOCK = 3;

/** "agotado" (0), "bajo" (1–3) or null (no stock tracked or enough). */
export function stockLevel(p: { stock: number | null; active?: boolean }): "agotado" | "bajo" | null {
  if (p.stock == null) return null;
  if (p.stock <= 0) return "agotado";
  return p.stock <= LOW_STOCK ? "bajo" : null;
}

/**
 * A product as a chat message: name, description and its prices as they are
 * (no conversion), e.g. «Precio: USD 10 · VES 350».
 */
export function productChatText(p: Pick<Product, "name" | "description" | "prices">): string {
  const prices = priceLine(p);
  return [`*${p.name}*`, p.description?.trim(), prices ? `Precio: ${prices}` : null].filter(Boolean).join("\n");
}
