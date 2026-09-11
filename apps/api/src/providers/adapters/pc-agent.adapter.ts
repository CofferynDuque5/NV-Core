import { Injectable } from "@nestjs/common";

import { PcAgentService } from "../../modules/pc-agent/pc-agent.module";
import { BaseAdapter } from "./base.adapter";
import type {
  AdapterContext,
  AdapterStatus,
  HealthResult,
  ProviderId,
  PublishInput,
  PublishResult,
} from "../provider.types";

/**
 * Facebook / Instagram through "NV Agente PC": the operator's own computer runs
 * a real browser logged in with their account and publishes what the panel
 * queues. Nothing here talks to Meta — publish() only enqueues the post; the
 * agent (see /agente-pc) picks it up within a minute and reports the outcome
 * to Historial.
 */
abstract class PcAgentAdapter extends BaseAdapter {
  readonly id = "agente-pc";
  readonly label = "Agente en tu PC (tu propio inicio de sesión)";
  protected abstract readonly target: "facebook" | "instagram";

  constructor(protected readonly agent: PcAgentService) {
    super();
  }

  override async publish(ctx: AdapterContext, input: PublishInput): Promise<PublishResult> {
    if (this.target === "instagram" && !(input.attachments ?? []).some((a) => a.url)) {
      return { ok: false, error: "Instagram requiere una imagen." };
    }
    const id = await this.agent.enqueue(ctx.workspaceSlug, this.target, input);
    // The agent writes its own Historial row with the real outcome once it publishes.
    return { ok: true, id: `agente:${id}`, format: input.format ?? "feed" };
  }

  override async connect(ctx: AdapterContext): Promise<AdapterStatus> {
    return this.getStatus(ctx);
  }

  override async authenticate(ctx: AdapterContext): Promise<AdapterStatus> {
    return this.getStatus(ctx);
  }

  override async getStatus(ctx: AdapterContext): Promise<AdapterStatus> {
    const p = this.agent.presence(ctx.workspaceSlug);
    const logged = this.target === "facebook" ? p.facebook : p.instagram;
    return {
      provider: this.provider,
      adapter: this.id,
      state: !p.online ? "disconnected" : logged ? "connected" : "unconfigured",
      detail: !p.online
        ? "NV Agente PC no está en línea. Ábrelo en tu computadora (INICIAR.bat)."
        : logged
          ? `Agente en línea${p.hostname ? ` (${p.hostname})` : ""} con sesión de ${this.target === "facebook" ? "Facebook" : "Instagram"}.`
          : `Agente en línea pero sin sesión de ${this.target === "facebook" ? "Facebook" : "Instagram"}: ejecuta INICIAR SESION.bat.`,
    };
  }

  override async healthCheck(ctx: AdapterContext): Promise<HealthResult> {
    const s = await this.getStatus(ctx);
    return {
      provider: this.provider,
      adapter: this.id,
      healthy: s.state === "connected",
      // "configured" = the queue works regardless; the agent publishes when it comes online.
      configured: true,
      message: s.detail ?? undefined,
    };
  }
}

@Injectable()
export class FacebookPcAgentAdapter extends PcAgentAdapter {
  readonly provider: ProviderId = "facebook";
  protected readonly target = "facebook" as const;
  constructor(agent: PcAgentService) {
    super(agent);
  }
}

@Injectable()
export class InstagramPcAgentAdapter extends PcAgentAdapter {
  readonly provider: ProviderId = "instagram";
  protected readonly target = "instagram" as const;
  constructor(agent: PcAgentService) {
    super(agent);
  }
}
