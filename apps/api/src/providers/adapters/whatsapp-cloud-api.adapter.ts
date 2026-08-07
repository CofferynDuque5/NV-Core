import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import {
  sendWhatsApp,
  sendWhatsAppMedia,
  sendWhatsAppTemplate,
} from "../../modules/messaging/messaging.transport";
import { BaseAdapter } from "./base.adapter";
import type {
  AdapterContext,
  AdapterStatus,
  HealthResult,
  ProviderId,
  SendMediaInput,
  SendMessageInput,
  SendResult,
} from "../provider.types";

/**
 * WhatsApp via the official Meta Cloud API (token + phone number id).
 *
 * This is the recommended primary WhatsApp adapter: it supports text and media
 * (image/video/document by public URL) and pre-approved templates, and it maps
 * Graph errors to an actionable taxonomy (auth / rate-limit / media / recipient
 * / transient) so the campaign runner can react correctly. Template sending is
 * exposed for callers that need to initiate outside the 24h window.
 */
@Injectable()
export class WhatsappCloudApiAdapter extends BaseAdapter {
  readonly id = "cloud-api";
  readonly label = "Cloud API (Meta oficial)";
  readonly provider: ProviderId = "whatsapp";

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    super();
  }

  private get whatsapp() {
    return this.config.get("integrations", { infer: true }).whatsapp;
  }

  private get configured(): boolean {
    return Boolean(this.whatsapp.token && this.whatsapp.phoneNumberId);
  }

  override async sendMessage(_ctx: AdapterContext, input: SendMessageInput): Promise<SendResult> {
    if (!this.configured) throw new Error("WhatsApp Cloud API sin configurar.");
    return sendWhatsApp(this.whatsapp, { channel: "wa", to: input.to, body: input.body });
  }

  override async sendMedia(_ctx: AdapterContext, input: SendMediaInput): Promise<SendResult> {
    if (!this.configured) throw new Error("WhatsApp Cloud API sin configurar.");
    return sendWhatsAppMedia(this.whatsapp, {
      to: input.to,
      body: input.body,
      attachment: input.attachment,
    });
  }

  /** Send a pre-approved template (initiates outside the 24h window). */
  sendTemplate(
    to: string,
    template: string,
    opts: { language?: string; variables?: string[] } = {},
  ): Promise<SendResult> {
    if (!this.configured) throw new Error("WhatsApp Cloud API sin configurar.");
    return sendWhatsAppTemplate(this.whatsapp, { to, template, ...opts });
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
        ? "Cloud API lista (texto, media y plantillas)."
        : "Configura WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID.",
    };
  }
}
