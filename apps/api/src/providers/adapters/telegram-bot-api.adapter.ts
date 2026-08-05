import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import { sendTelegram } from "../../modules/messaging/messaging.providers";
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
 * Telegram via the official Bot API. Delegates delivery to the pure transport
 * helper (the only place that touches Telegram's HTTP API).
 */
@Injectable()
export class TelegramBotApiAdapter extends BaseAdapter {
  readonly id = "bot-api";
  readonly label = "Telegram Bot API (oficial)";
  readonly provider: ProviderId = "telegram";

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    super();
  }

  private get telegram() {
    return this.config.get("integrations", { infer: true }).telegram;
  }

  private get configured(): boolean {
    return Boolean(this.telegram.botToken);
  }

  override async sendMessage(_ctx: AdapterContext, input: SendMessageInput): Promise<SendResult> {
    if (!this.configured) throw new Error("Telegram sin TELEGRAM_BOT_TOKEN.");
    return sendTelegram(this.telegram, { channel: "tg", to: input.to, body: input.body });
  }

  override async getStatus(_ctx: AdapterContext): Promise<AdapterStatus> {
    return {
      provider: this.provider,
      adapter: this.id,
      state: this.configured ? "connected" : "unconfigured",
      detail: this.configured ? "Bot configurado." : "Falta TELEGRAM_BOT_TOKEN.",
    };
  }

  override async healthCheck(_ctx: AdapterContext): Promise<HealthResult> {
    return {
      provider: this.provider,
      adapter: this.id,
      healthy: this.configured,
      configured: this.configured,
      message: this.configured ? "Telegram listo." : "Configura TELEGRAM_BOT_TOKEN.",
    };
  }
}
