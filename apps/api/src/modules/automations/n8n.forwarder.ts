import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import { EventBus } from "../../core/events/event-bus.service";
import type { DomainEventName } from "../../core/events/domain-events";
import { triggerWebhook } from "./n8n.client";

/** Domain events forwarded to n8n so workflows can orchestrate on them. */
const FORWARDED: DomainEventName[] = [
  "message.received",
  "campaign.completed",
  "provider.published",
  "message.sent",
  "job.failed",
];

/**
 * Forwards internal domain events to n8n (the orchestrator). n8n receives each
 * event on its webhook and decides what to do — typically calling back into the
 * backend action endpoints (see AutomationBridgeController). This inverts the
 * old direction: the backend no longer drives n8n; it just reports events.
 */
@Injectable()
export class N8nEventForwarder implements OnModuleInit {
  private readonly logger = new Logger(N8nEventForwarder.name);

  constructor(
    private readonly events: EventBus,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onModuleInit(): void {
    const n8n = this.config.get("integrations", { infer: true }).n8n;
    if (!n8n.eventsWebhook) {
      this.logger.log("Forwarder de eventos a n8n inactivo (sin N8N_EVENTS_WEBHOOK).");
      return;
    }
    for (const event of FORWARDED) {
      this.events.on(event, (payload) => this.forward(n8n, event, payload));
    }
    this.logger.log(`Reenviando eventos a n8n → ${n8n.eventsWebhook}`);
  }

  private async forward(
    n8n: AppConfig["integrations"]["n8n"],
    event: DomainEventName,
    payload: unknown,
  ): Promise<void> {
    try {
      await triggerWebhook(n8n, n8n.eventsWebhook!, {
        event,
        payload,
        at: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn(`No se pudo reenviar "${event}" a n8n: ${(err as Error).message}`);
    }
  }
}
