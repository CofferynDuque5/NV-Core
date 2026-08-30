import { Injectable } from "@nestjs/common";

import { AyrshareService, type AyrsharePlatform } from "../../modules/social/ayrshare.service";
import { BaseAdapter } from "./base.adapter";
import type {
  AdapterContext,
  AdapterStatus,
  HealthResult,
  ProviderId,
  PublishInput,
  PublishResult,
} from "../provider.types";

/**
 * Facebook / Instagram publishing via Ayrshare (single API key, no Meta app
 * review). Delegates to {@link AyrshareService}. One base, two concrete adapters
 * so each provider registers its own instance — same shape as the Meta Graph
 * adapters, so switching between them is a Conexiones selection, not code.
 */
abstract class AyrshareAdapter extends BaseAdapter {
  readonly id = "ayrshare";
  readonly label = "Ayrshare (fácil, sin revisión de Meta)";
  protected abstract readonly platform: AyrsharePlatform;

  constructor(protected readonly ayrshare: AyrshareService) {
    super();
  }

  override async publish(_ctx: AdapterContext, input: PublishInput): Promise<PublishResult> {
    const [result] = await this.ayrshare.publish([this.platform], {
      message: input.message,
      attachments: input.attachments,
      format: input.format ?? null,
    });
    if (!result) return { ok: false, error: "Sin resultado de Ayrshare." };
    return {
      ok: result.ok,
      id: result.id,
      format: input.format ?? null,
      error: result.error,
      retriable: result.retriable,
    };
  }

  override async connect(ctx: AdapterContext): Promise<AdapterStatus> {
    // API-key based: nothing to open — surface the current status.
    return this.getStatus(ctx);
  }

  override async authenticate(ctx: AdapterContext): Promise<AdapterStatus> {
    return this.getStatus(ctx);
  }

  override async getStatus(_ctx: AdapterContext): Promise<AdapterStatus> {
    const ok = this.ayrshare.configured();
    return {
      provider: this.provider,
      adapter: this.id,
      state: ok ? "connected" : "unconfigured",
      detail: ok
        ? "Ayrshare configurado. Vincula tus cuentas en el panel de Ayrshare."
        : "Falta AYRSHARE_API_KEY (pnpm ayrshare <API_KEY>).",
    };
  }

  override async healthCheck(_ctx: AdapterContext): Promise<HealthResult> {
    const h = await this.ayrshare.health();
    return {
      provider: this.provider,
      adapter: this.id,
      healthy: h.healthy,
      configured: h.configured,
      message: h.message,
    };
  }
}

// Explicit constructor so TypeScript emits DI metadata on the concrete class
// (otherwise Nest injects nothing and `this.ayrshare` is undefined at runtime).
@Injectable()
export class FacebookAyrshareAdapter extends AyrshareAdapter {
  readonly provider: ProviderId = "facebook";
  protected readonly platform: AyrsharePlatform = "facebook";
  constructor(ayrshare: AyrshareService) {
    super(ayrshare);
  }
}

@Injectable()
export class InstagramAyrshareAdapter extends AyrshareAdapter {
  readonly provider: ProviderId = "instagram";
  protected readonly platform: AyrsharePlatform = "instagram";
  constructor(ayrshare: AyrshareService) {
    super(ayrshare);
  }
}
