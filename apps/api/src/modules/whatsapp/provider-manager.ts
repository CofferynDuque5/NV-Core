import { Injectable, Logger } from "@nestjs/common";

import { MessagingService } from "../messaging/messaging.module";
import { WhatsappService } from "./whatsapp.service";

/**
 * Routes outbound messages to the right provider.
 *
 * WhatsApp: prefer the live Baileys session for the workspace; fall back to the
 * Cloud API (WHATSAPP_TOKEN) when Baileys isn't connected. Other channels go
 * through the existing messaging providers. Swapping WhatsApp to Cloud API only
 * (or adding channels) happens here — callers stay unchanged.
 */
@Injectable()
export class ProviderManager {
  private readonly logger = new Logger(ProviderManager.name);

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly messaging: MessagingService,
  ) {}

  async send(
    workspaceSlug: string,
    channel: string,
    to: string,
    body: string,
  ): Promise<{ id: string }> {
    if (channel === "wa" && this.whatsapp.isConnected(workspaceSlug)) {
      this.logger.debug?.(`WhatsApp vía Baileys → ${to}`);
      return this.whatsapp.sendText(workspaceSlug, to, body);
    }
    return this.messaging.send(workspaceSlug, { channel, to, body });
  }
}
