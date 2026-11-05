import { BadRequestException } from "@nestjs/common";
import type { CampaignAttachment, CampaignItem } from "@nv/domain";

/** Most product messages one campaign sends to each group. */
export const MAX_CAMPAIGN_ITEMS = 10;
const MAX_TEXT = 4000;

/**
 * Validate and trim the per-product messages of a campaign. Each needs a text
 * or an image; at most one image each (WhatsApp/Telegram send one per message).
 */
export function cleanItems(raw: unknown): CampaignItem[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new BadRequestException("Los productos de la campaña deben ser una lista.");
  if (raw.length > MAX_CAMPAIGN_ITEMS) {
    throw new BadRequestException(`Una campaña puede llevar hasta ${MAX_CAMPAIGN_ITEMS} productos.`);
  }
  return raw.map((r, i) => {
    const it = (r ?? {}) as Record<string, unknown>;
    const text = typeof it.text === "string" ? it.text.trim().slice(0, MAX_TEXT) : "";
    const attachments = (Array.isArray(it.attachments) ? (it.attachments as CampaignAttachment[]) : [])
      .filter((a) => a && typeof a.url === "string" && a.url)
      .slice(0, 1)
      .map((a) => ({ url: a.url, kind: a.kind, mime: a.mime ?? null, filename: a.filename ?? null, path: a.path }));
    const name = (typeof it.name === "string" ? it.name.trim() : "").slice(0, 80) || `Producto ${i + 1}`;
    if (!text && attachments.length === 0) {
      throw new BadRequestException(`«${name}» no tiene texto ni imagen.`);
    }
    const prices: Record<string, string> = {};
    if (it.prices && typeof it.prices === "object") {
      for (const [k, v] of Object.entries(it.prices as Record<string, unknown>)) {
        const amount = typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, 40) : "";
        if (/^[A-Z]{3,4}$/.test(k) && amount) prices[k] = amount;
      }
    }
    return {
      productId: typeof it.productId === "string" ? it.productId : null,
      name,
      text,
      attachments,
      prices,
    };
  });
}

/** The stored items of a campaign row (always an array). */
export function campaignItems(raw: unknown): CampaignItem[] {
  return Array.isArray(raw) ? (raw as CampaignItem[]) : [];
}

export const itemsHaveImage = (items: CampaignItem[]) => items.some((i) => (i.attachments ?? []).some((a) => a.url));
