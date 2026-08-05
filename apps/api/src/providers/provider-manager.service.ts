import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import {
  PROVIDER_IDS,
  type AdapterContext,
  type AdapterStatus,
  type ChannelAdapter,
  type HealthResult,
  type Provider,
  type ProviderId,
  type PublishInput,
  type PublishResult,
  type SendMediaInput,
  type SendMessageInput,
  type SendResult,
} from "./provider.types";
import {
  EmailProvider,
  FacebookProvider,
  InstagramProvider,
  TiktokProvider,
  WhatsappProvider,
} from "./providers";

/** Maps @nv/domain channel ids to provider ids. */
const CHANNEL_TO_PROVIDER: Record<string, ProviderId> = {
  wa: "whatsapp",
  fb: "facebook",
  ig: "instagram",
  email: "email",
  tk: "tiktok",
};

export interface ProviderView {
  id: ProviderId;
  label: string;
  activeAdapter: string;
  defaultAdapter: string;
  adapters: { id: string; label: string }[];
}

/**
 * The single entry point to every external channel.
 *
 * The rest of the system calls ProviderManager (never an external API or an
 * adapter directly). The manager resolves the workspace's active adapter for a
 * provider — chosen in the Conexiones module, persisted in `ProviderSelection`,
 * falling back to the provider's default — and delegates the operation to it.
 */
@Injectable()
export class ProviderManager {
  private readonly logger = new Logger(ProviderManager.name);
  private readonly providers = new Map<ProviderId, Provider>();
  /** In-memory selection fallback when the DB is not configured. */
  private readonly memorySelection = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    whatsapp: WhatsappProvider,
    facebook: FacebookProvider,
    instagram: InstagramProvider,
    email: EmailProvider,
    tiktok: TiktokProvider,
  ) {
    for (const p of [whatsapp, facebook, instagram, email, tiktok]) {
      this.providers.set(p.id, p);
    }
  }

  // ── Provider / adapter resolution ─────────────────────────────────────────
  getProvider(id: ProviderId): Provider {
    const p = this.providers.get(id);
    if (!p) throw new NotFoundException(`Proveedor desconocido: ${id}`);
    return p;
  }

  providerForChannel(channel: string): ProviderId | undefined {
    return CHANNEL_TO_PROVIDER[channel];
  }

  private key(workspaceSlug: string, provider: ProviderId): string {
    return `${workspaceSlug}:${provider}`;
  }

  /** The stored active adapter id for the workspace, or the provider default. */
  async activeAdapterId(workspaceSlug: string, providerId: ProviderId): Promise<string> {
    const provider = this.getProvider(providerId);
    if (this.prisma.enabled) {
      const row = await this.prisma.providerSelection.findUnique({
        where: { workspaceSlug_provider: { workspaceSlug, provider: providerId } },
      });
      if (row && provider.adapter(row.adapter)) return row.adapter;
    } else {
      const mem = this.memorySelection.get(this.key(workspaceSlug, providerId));
      if (mem && provider.adapter(mem)) return mem;
    }
    return provider.defaultAdapterId;
  }

  /** Resolve the active {@link ChannelAdapter} for a workspace + provider. */
  async getActiveAdapter(workspaceSlug: string, providerId: ProviderId): Promise<ChannelAdapter> {
    const provider = this.getProvider(providerId);
    const id = await this.activeAdapterId(workspaceSlug, providerId);
    const adapter = provider.adapter(id) ?? provider.adapter(provider.defaultAdapterId);
    if (!adapter) throw new NotFoundException(`Proveedor ${providerId} sin adapters.`);
    return adapter;
  }

  /** Choose the active adapter for a provider (Conexiones module). */
  async setActiveAdapter(
    workspaceSlug: string,
    providerId: ProviderId,
    adapterId: string,
  ): Promise<ProviderView> {
    const provider = this.getProvider(providerId);
    if (!provider.adapter(adapterId)) {
      throw new BadRequestException(`El proveedor ${providerId} no tiene el adapter "${adapterId}".`);
    }
    if (this.prisma.enabled) {
      await this.prisma.providerSelection.upsert({
        where: { workspaceSlug_provider: { workspaceSlug, provider: providerId } },
        create: { workspaceSlug, provider: providerId, adapter: adapterId },
        update: { adapter: adapterId },
      });
    } else {
      this.memorySelection.set(this.key(workspaceSlug, providerId), adapterId);
    }
    this.logger.log(`[${workspaceSlug}] ${providerId} → adapter "${adapterId}"`);
    return this.view(workspaceSlug, providerId);
  }

  // ── Views for the Conexiones UI ───────────────────────────────────────────
  async view(workspaceSlug: string, providerId: ProviderId): Promise<ProviderView> {
    const provider = this.getProvider(providerId);
    return {
      id: provider.id,
      label: provider.label,
      activeAdapter: await this.activeAdapterId(workspaceSlug, providerId),
      defaultAdapter: provider.defaultAdapterId,
      adapters: provider.adapters.map((a) => ({ id: a.id, label: a.label })),
    };
  }

  async listProviders(workspaceSlug: string): Promise<ProviderView[]> {
    return Promise.all(PROVIDER_IDS.map((id) => this.view(workspaceSlug, id)));
  }

  // ── Delegated operations (always via the active adapter) ───────────────────
  private ctx(workspaceSlug: string): AdapterContext {
    return { workspaceSlug };
  }

  async connect(workspaceSlug: string, providerId: ProviderId): Promise<AdapterStatus> {
    return (await this.getActiveAdapter(workspaceSlug, providerId)).connect(this.ctx(workspaceSlug));
  }

  async disconnect(workspaceSlug: string, providerId: ProviderId): Promise<AdapterStatus> {
    return (await this.getActiveAdapter(workspaceSlug, providerId)).disconnect(this.ctx(workspaceSlug));
  }

  async authenticate(workspaceSlug: string, providerId: ProviderId): Promise<AdapterStatus> {
    return (await this.getActiveAdapter(workspaceSlug, providerId)).authenticate(this.ctx(workspaceSlug));
  }

  async status(workspaceSlug: string, providerId: ProviderId): Promise<AdapterStatus> {
    return (await this.getActiveAdapter(workspaceSlug, providerId)).getStatus(this.ctx(workspaceSlug));
  }

  async healthCheck(workspaceSlug: string, providerId: ProviderId): Promise<HealthResult> {
    return (await this.getActiveAdapter(workspaceSlug, providerId)).healthCheck(this.ctx(workspaceSlug));
  }

  async publish(
    workspaceSlug: string,
    providerId: ProviderId,
    input: PublishInput,
  ): Promise<PublishResult> {
    return (await this.getActiveAdapter(workspaceSlug, providerId)).publish(this.ctx(workspaceSlug), input);
  }

  async sendMessage(
    workspaceSlug: string,
    providerId: ProviderId,
    input: SendMessageInput,
  ): Promise<SendResult> {
    return (await this.getActiveAdapter(workspaceSlug, providerId)).sendMessage(this.ctx(workspaceSlug), input);
  }

  async sendMedia(
    workspaceSlug: string,
    providerId: ProviderId,
    input: SendMediaInput,
  ): Promise<SendResult> {
    return (await this.getActiveAdapter(workspaceSlug, providerId)).sendMedia(this.ctx(workspaceSlug), input);
  }

  /** Convenience: send by @nv/domain channel id (wa/fb/ig/email/tk). */
  async sendByChannel(workspaceSlug: string, channel: string, to: string, body: string): Promise<SendResult> {
    const providerId = this.providerForChannel(channel);
    if (!providerId) throw new BadRequestException(`Canal sin proveedor: ${channel}`);
    return this.sendMessage(workspaceSlug, providerId, { to, body });
  }
}
