import { Injectable } from "@nestjs/common";

import { MetaService } from "../../modules/social/meta.service";
import { BaseAdapter } from "./base.adapter";
import type {
  AdapterContext,
  AdapterStatus,
  HealthResult,
  ProviderId,
  PublishInput,
  PublishResult,
} from "../provider.types";

type MetaTarget = "facebook" | "instagram";

/**
 * Facebook Page / Instagram Business publishing via the Meta Graph API.
 * Delegates to the existing {@link MetaService}. One base, two concrete adapters
 * (Facebook / Instagram) so each provider registers its own instance.
 */
abstract class MetaGraphAdapter extends BaseAdapter {
  readonly id = "meta-graph";
  readonly label = "Meta Graph API (oficial)";
  protected abstract readonly target: MetaTarget;

  constructor(protected readonly meta: MetaService) {
    super();
  }

  private async configured(ctx: AdapterContext): Promise<boolean> {
    const s = await this.meta.status(ctx.workspaceSlug);
    return this.target === "facebook" ? s.facebook : s.instagram;
  }

  override async publish(ctx: AdapterContext, input: PublishInput): Promise<PublishResult> {
    const [result] = await this.meta.publish(ctx.workspaceSlug, [this.target], {
      message: input.message,
      attachments: input.attachments,
      format: input.format ?? null,
    });
    if (!result) return { ok: false, error: "Sin resultado del publicador Meta." };
    return { ok: result.ok, id: result.id, format: result.format, error: result.error };
  }

  override async connect(ctx: AdapterContext): Promise<AdapterStatus> {
    // Token-based: nothing to open — surface the current status.
    return this.getStatus(ctx);
  }

  override async authenticate(ctx: AdapterContext): Promise<AdapterStatus> {
    return this.getStatus(ctx);
  }

  override async getStatus(ctx: AdapterContext): Promise<AdapterStatus> {
    const ok = await this.configured(ctx);
    return {
      provider: this.provider,
      adapter: this.id,
      state: ok ? "connected" : "unconfigured",
      detail: ok ? "Token de Meta válido." : "Faltan credenciales de Meta (Página / IG Business).",
    };
  }

  override async healthCheck(ctx: AdapterContext): Promise<HealthResult> {
    const ok = await this.configured(ctx);
    return {
      provider: this.provider,
      adapter: this.id,
      healthy: ok,
      configured: ok,
      message: ok ? "Meta Graph configurada." : "Configura las credenciales de Meta.",
    };
  }
}

@Injectable()
export class FacebookMetaGraphAdapter extends MetaGraphAdapter {
  readonly provider: ProviderId = "facebook";
  protected readonly target: MetaTarget = "facebook";
}

@Injectable()
export class InstagramMetaGraphAdapter extends MetaGraphAdapter {
  readonly provider: ProviderId = "instagram";
  protected readonly target: MetaTarget = "instagram";
}
