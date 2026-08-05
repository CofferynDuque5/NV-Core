import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import { MessagingService } from "../../modules/messaging/messaging.module";
import { BaseAdapter } from "./base.adapter";
import type {
  AdapterContext,
  AdapterStatus,
  HealthResult,
  ProviderId,
  SendMessageInput,
  SendResult,
} from "../provider.types";

/**
 * WhatsApp via the official Meta Cloud API (token + phone number id).
 *
 * Text delivery is wired through the existing messaging provider. The richer
 * template / media flows of the Cloud API are left as an explicit placeholder
 * (they require a WABA + approved templates) — the adapter reports them as
 * unconfigured through {@link healthCheck} rather than pretending to support
 * them.
 */
@Injectable()
export class WhatsappCloudApiAdapter extends BaseAdapter {
  readonly id = "cloud-api";
  readonly label = "Cloud API (Meta oficial)";
  readonly provider: ProviderId = "whatsapp";

  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    super();
  }

  private get configured(): boolean {
    const wa = this.config.get("integrations", { infer: true }).whatsapp;
    return Boolean(wa.token && wa.phoneNumberId);
  }

  override async sendMessage(ctx: AdapterContext, input: SendMessageInput): Promise<SendResult> {
    return this.messaging.send(ctx.workspaceSlug, {
      channel: "wa",
      to: input.to,
      body: input.body,
    });
  }

  override async getStatus(_ctx: AdapterContext): Promise<AdapterStatus> {
    return {
      provider: this.provider,
      adapter: this.id,
      state: this.configured ? "connected" : "unconfigured",
      detail: this.configured ? "Cloud API configurada." : "Falta WHATSAPP_TOKEN / PHONE_NUMBER_ID.",
    };
  }

  override async healthCheck(_ctx: AdapterContext): Promise<HealthResult> {
    return {
      provider: this.provider,
      adapter: this.id,
      healthy: this.configured,
      configured: this.configured,
      message: this.configured
        ? "Cloud API lista para enviar texto."
        : "Configura WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID.",
    };
  }
}
