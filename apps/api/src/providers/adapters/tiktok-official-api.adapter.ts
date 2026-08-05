import { Injectable } from "@nestjs/common";

import { BaseAdapter } from "./base.adapter";
import type { AdapterContext, AdapterStatus, HealthResult, ProviderId } from "../provider.types";

/**
 * TikTok via the official Content Posting API.
 *
 * Placeholder: TikTok requires an approved developer app + OAuth per account.
 * The adapter is fully registered and selectable, but reports itself
 * unconfigured until credentials exist (no fake success paths). The env keys it
 * will consume are TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / per-account token.
 */
@Injectable()
export class TiktokOfficialApiAdapter extends BaseAdapter {
  readonly id = "official-api";
  readonly label = "TikTok Content Posting API (oficial)";
  readonly provider: ProviderId = "tiktok";

  private get configured(): boolean {
    return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
  }

  override async getStatus(_ctx: AdapterContext): Promise<AdapterStatus> {
    return {
      provider: this.provider,
      adapter: this.id,
      state: this.configured ? "disconnected" : "unconfigured",
      detail: this.configured
        ? "App configurada; falta autorizar la cuenta."
        : "Falta TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET.",
    };
  }

  override async healthCheck(_ctx: AdapterContext): Promise<HealthResult> {
    return {
      provider: this.provider,
      adapter: this.id,
      healthy: false,
      configured: this.configured,
      message: this.configured
        ? "Pendiente de OAuth por cuenta (Content Posting API)."
        : "Configura las credenciales de la app de TikTok.",
    };
  }
}
