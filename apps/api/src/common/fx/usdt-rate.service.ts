import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { UsdtRate } from "@nv/domain";

import type { AppConfig } from "../../config/configuration";

/** How long a fetched rate is reused before asking again. */
export const RATE_TTL_MS = 30 * 60_000;
/** A rate older than this is not shown (better no rate than a stale one). */
export const RATE_MAX_AGE_MS = 24 * 3_600_000;
const BINANCE_P2P = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

/** Median of the offer prices in a Binance P2P search answer (undefined if none is usable). */
export function medianP2pPrice(body: unknown): number | undefined {
  const data = (body as { data?: { adv?: { price?: unknown } }[] } | null)?.data;
  if (!Array.isArray(data)) return undefined;
  const prices = data
    .map((d) => Number(d?.adv?.price))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100_000_000)
    .sort((a, b) => a - b);
  if (prices.length === 0) return undefined;
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid]! : (prices[mid - 1]! + prices[mid]!) / 2;
  return Math.round(median * 100) / 100;
}

/**
 * Bolívares per USDT, to quote plan prices to customers paying with a
 * Venezuelan method. A fixed `USDT_VES_RATE` wins; otherwise the median of
 * the first Binance P2P offers to buy USDT with VES (public data, no account
 * or key), cached 30 minutes. Never throws: no rate is a valid answer.
 */
@Injectable()
export class UsdtRateService {
  private readonly logger = new Logger(UsdtRateService.name);
  private cached: UsdtRate | null = null;
  private inflight: Promise<UsdtRate | null> | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async current(now = Date.now()): Promise<UsdtRate | null> {
    const billing = this.config.get("billing", { infer: true });
    if (billing.usdtVesRate)
      return { rate: billing.usdtVesRate, source: "manual", at: new Date(now).toISOString() };
    if (this.cached && now - Date.parse(this.cached.at) < RATE_TTL_MS) return this.cached;
    if (!billing.autoRate) return null;
    this.inflight ??= this.fetchBinance().finally(() => {
      this.inflight = null;
    });
    const fresh = await this.inflight;
    if (fresh) this.cached = fresh;
    if (this.cached && now - Date.parse(this.cached.at) < RATE_MAX_AGE_MS) return this.cached;
    return null;
  }

  private async fetchBinance(): Promise<UsdtRate | null> {
    try {
      const res = await fetch(BINANCE_P2P, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          asset: "USDT",
          fiat: "VES",
          tradeType: "BUY",
          page: 1,
          rows: 10,
          payTypes: [],
          publisherType: null,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rate = medianP2pPrice(await res.json());
      if (!rate) throw new Error("sin ofertas");
      return { rate, source: "binance", at: new Date().toISOString() };
    } catch (err) {
      this.logger.warn(`No se pudo leer la tasa USDT de Binance P2P: ${(err as Error).message}`);
      return null;
    }
  }
}
