import { Injectable } from "@nestjs/common";

import { WhatsappService } from "../../modules/whatsapp/whatsapp.service";
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
 * WhatsApp via Baileys (WhatsApp Web) — the QR-based, no-official-API path.
 * Delegates to the existing {@link WhatsappService} (per-workspace sessions).
 */
@Injectable()
export class WhatsappBaileysAdapter extends BaseAdapter {
  readonly id = "baileys";
  readonly label = "Baileys (WhatsApp Web / QR)";
  readonly provider: ProviderId = "whatsapp";

  constructor(private readonly whatsapp: WhatsappService) {
    super();
  }

  private mapState(status: string): AdapterState {
    if (status === "connected" || status === "connecting" || status === "qr") return status;
    return "disconnected";
  }

  override async connect(ctx: AdapterContext): Promise<AdapterStatus> {
    const s = await this.whatsapp.connect(ctx.workspaceSlug);
    return this.toStatus(s);
  }

  override async authenticate(ctx: AdapterContext): Promise<AdapterStatus> {
    // Authentication = opening the socket so a QR is emitted for scanning.
    return this.connect(ctx);
  }

  override async refreshCredentials(ctx: AdapterContext): Promise<AdapterStatus> {
    const s = await this.whatsapp.reconnect(ctx.workspaceSlug);
    return this.toStatus(s);
  }

  override async disconnect(ctx: AdapterContext): Promise<AdapterStatus> {
    const s = await this.whatsapp.disconnect(ctx.workspaceSlug);
    return this.toStatus(s);
  }

  override async sendMessage(ctx: AdapterContext, input: SendMessageInput): Promise<SendResult> {
    return this.whatsapp.sendText(ctx.workspaceSlug, input.to, input.body);
  }

  override async sendMedia(ctx: AdapterContext, input: SendMediaInput): Promise<SendResult> {
    return this.whatsapp.sendMedia(ctx.workspaceSlug, input.to, input.body ?? "", input.attachment);
  }

  override async getStatus(ctx: AdapterContext): Promise<AdapterStatus> {
    const s = await this.whatsapp.status(ctx.workspaceSlug);
    return this.toStatus(s);
  }

  override async healthCheck(ctx: AdapterContext): Promise<HealthResult> {
    const connected = this.whatsapp.isConnected(ctx.workspaceSlug);
    return {
      provider: this.provider,
      adapter: this.id,
      healthy: connected,
      configured: true,
      message: connected ? "Sesión activa." : "Sin sesión activa (escanea el QR).",
    };
  }

  private toStatus(s: {
    status: string;
    number?: string | null;
    groupsCount?: number;
    contactsCount?: number;
  }): AdapterStatus {
    return {
      provider: this.provider,
      adapter: this.id,
      state: this.mapState(s.status),
      detail: s.number ?? null,
      meta: { groupsCount: s.groupsCount ?? 0, contactsCount: s.contactsCount ?? 0 },
    };
  }
}
