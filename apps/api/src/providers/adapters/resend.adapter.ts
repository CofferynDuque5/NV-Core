import { Injectable } from "@nestjs/common";

import { MailService } from "../../common/mail.service";
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
 * Transactional email via Resend. Delegates to the existing {@link MailService}.
 * `sendMessage` treats `to` as the recipient and `body` as the HTML content.
 */
@Injectable()
export class ResendAdapter extends BaseAdapter {
  readonly id = "resend";
  readonly label = "Resend (email transaccional)";
  readonly provider: ProviderId = "email";

  constructor(private readonly mail: MailService) {
    super();
  }

  override async sendMessage(_ctx: AdapterContext, input: SendMessageInput): Promise<SendResult> {
    const res = await this.mail.send({
      to: input.to,
      subject: "Mensaje de NV Core",
      html: input.body,
    });
    if (!res.sent) throw new Error("Email no enviado: proveedor no configurado o error de Resend.");
    return { id: res.id ?? "" };
  }

  override async getStatus(_ctx: AdapterContext): Promise<AdapterStatus> {
    return {
      provider: this.provider,
      adapter: this.id,
      state: this.mail.enabled ? "connected" : "unconfigured",
      detail: this.mail.enabled ? "Resend configurado." : "Falta RESEND_API_KEY.",
    };
  }

  override async healthCheck(_ctx: AdapterContext): Promise<HealthResult> {
    return {
      provider: this.provider,
      adapter: this.id,
      healthy: this.mail.enabled,
      configured: this.mail.enabled,
      message: this.mail.enabled ? "Resend listo." : "Configura RESEND_API_KEY.",
    };
  }
}
