import { Injectable } from "@nestjs/common";

import { TelegramUserService } from "../../modules/telegram/telegram-user.service";
import { BaseAdapter } from "./base.adapter";
import type {
  AdapterContext,
  AdapterState,
  AdapterStatus,
  HealthResult,
  ProviderId,
  SendMediaInput,
  SendMessageInput,
  SendResult,
} from "../provider.types";

/**
 * Telegram via a user account (GramJS / MTProto, QR login). Sends as the user,
 * so campaigns reach every group and channel the account belongs to — no bot
 * admin step, no manual chat_id. Delegates to {@link TelegramUserService}.
 */
@Injectable()
export class TelegramUserAdapter extends BaseAdapter {
  readonly id = "user-mtproto";
  readonly label = "Telegram (cuenta / QR)";
  readonly provider: ProviderId = "telegram";

  constructor(private readonly telegram: TelegramUserService) {
    super();
  }

  private mapState(status: string): AdapterState {
    if (status === "connected" || status === "connecting" || status === "qr") return status;
    return "disconnected";
  }

  override async connect(ctx: AdapterContext): Promise<AdapterStatus> {
    return this.toStatus(await this.telegram.connect(ctx.workspaceSlug));
  }
  override async authenticate(ctx: AdapterContext): Promise<AdapterStatus> {
    return this.connect(ctx);
  }
  override async refreshCredentials(ctx: AdapterContext): Promise<AdapterStatus> {
    return this.toStatus(await this.telegram.reconnect(ctx.workspaceSlug));
  }
  override async disconnect(ctx: AdapterContext): Promise<AdapterStatus> {
    return this.toStatus(await this.telegram.disconnect(ctx.workspaceSlug));
  }

  override async sendMessage(ctx: AdapterContext, input: SendMessageInput): Promise<SendResult> {
    return this.telegram.sendText(ctx.workspaceSlug, input.to, input.body);
  }

  override async sendMedia(ctx: AdapterContext, input: SendMediaInput): Promise<SendResult> {
    return this.telegram.sendMedia(ctx.workspaceSlug, input.to, input.body ?? "", input.attachment);
  }

  override async getStatus(ctx: AdapterContext): Promise<AdapterStatus> {
    return this.toStatus(await this.telegram.status(ctx.workspaceSlug));
  }

  override async healthCheck(ctx: AdapterContext): Promise<HealthResult> {
    const connected = this.telegram.isConnected(ctx.workspaceSlug);
    return {
      provider: this.provider,
      adapter: this.id,
      healthy: connected,
      configured: this.telegram.configured,
      message: this.telegram.configured
        ? connected
          ? "Cuenta de Telegram conectada."
          : "Sin sesión (escanea el QR en Conexiones)."
        : "Falta TELEGRAM_API_ID / TELEGRAM_API_HASH.",
    };
  }

  private toStatus(s: { status: string; username?: string | null; groupsCount?: number }): AdapterStatus {
    return {
      provider: this.provider,
      adapter: this.id,
      state: this.mapState(s.status),
      detail: s.username ? `@${s.username}` : null,
      meta: { groupsCount: s.groupsCount ?? 0 },
    };
  }
}
