import { Injectable, type OnModuleInit } from "@nestjs/common";

import { EventBus } from "../core/events/event-bus.service";
import { JobManager } from "../core/jobs/job-manager.service";
import { ProviderManager } from "./provider-manager.service";
import type { ProviderId, PublishInput } from "./provider.types";

interface OutboundMessagePayload {
  workspaceSlug: string;
  channel: string;
  to: string;
  body: string;
}

interface OutboundPublishPayload extends PublishInput {
  workspaceSlug: string;
  provider: ProviderId;
}

/**
 * Async outbound work, always through the ProviderManager and tracked by the
 * Job Manager (state, retries, failures). Feature code and n8n dispatch jobs
 * here instead of calling providers synchronously, which decouples the request
 * from delivery and gives automatic retries.
 */
@Injectable()
export class OutboundDispatcher implements OnModuleInit {
  constructor(
    private readonly manager: ProviderManager,
    private readonly jobs: JobManager,
    private readonly events: EventBus,
  ) {}

  onModuleInit(): void {
    this.jobs.register("outbound.message", async (payload) => {
      const p = payload as OutboundMessagePayload;
      const res = await this.manager.sendByChannel(p.workspaceSlug, p.channel, p.to, p.body);
      this.events.emit("message.sent", {
        workspaceSlug: p.workspaceSlug,
        provider: this.manager.providerForChannel(p.channel) ?? p.channel,
        to: p.to,
        id: res.id,
      });
      return res;
    });

    this.jobs.register("outbound.publish", async (payload) => {
      const p = payload as OutboundPublishPayload;
      const res = await this.manager.publish(p.workspaceSlug, p.provider, {
        message: p.message,
        attachments: p.attachments,
        format: p.format,
      });
      this.events.emit("provider.published", {
        workspaceSlug: p.workspaceSlug,
        provider: p.provider,
        ok: res.ok,
        id: res.id,
      });
      if (!res.ok) throw new Error(res.error ?? "La publicación falló.");
      return res;
    });
  }

  /** Enqueue an outbound direct message (returns the job id). */
  dispatchMessage(workspaceSlug: string, channel: string, to: string, body: string): Promise<string> {
    return this.jobs.dispatch(
      "outbound.message",
      workspaceSlug,
      { workspaceSlug, channel, to, body } satisfies OutboundMessagePayload,
      { maxAttempts: 3 },
    );
  }

  /** Enqueue an outbound social publish (returns the job id). */
  dispatchPublish(workspaceSlug: string, provider: ProviderId, input: PublishInput): Promise<string> {
    return this.jobs.dispatch(
      "outbound.publish",
      workspaceSlug,
      { workspaceSlug, provider, ...input } satisfies OutboundPublishPayload,
      { maxAttempts: 3 },
    );
  }
}
