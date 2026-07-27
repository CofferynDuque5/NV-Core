import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Campaign as PCampaign } from "@prisma/client";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogger } from "../../common/audit-logger.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";
import type { WhatsappAttachment } from "../whatsapp/whatsapp.types";
import { MetaService } from "../social/meta.service";
import { builtinVars, renderTemplate } from "./render";

const TICK_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayKey = () => new Date().toISOString().slice(0, 10);

type Attachment = { url?: string; kind?: string; mime?: string | null; filename?: string | null };

/**
 * Evaluates scheduled campaigns on a tick and delivers them to their target
 * WhatsApp groups (personalized per group), recording every attempt in SendLog.
 * Runs in-process (no Redis needed); social publishing is delegated per target.
 */
@Injectable()
export class CampaignRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignRunner.name);
  private readonly groupDelayMs: number;
  private readonly running = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly meta: MetaService,
    private readonly audit: AuditLogger,
  ) {
    this.groupDelayMs = Number(process.env.WHATSAPP_GROUP_DELAY_MS ?? 4000);
    void config; // reserved for future tuning
  }

  onModuleInit(): void {
    if (!this.prisma.enabled) {
      this.logger.log("CampaignRunner inactivo (sin base de datos).");
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log(`CampaignRunner activo (cada ${TICK_MS / 1000}s).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private isDue(c: PCampaign, now: Date): boolean {
    if (c.status === "pausada" || c.status === "completada") return false;
    if (this.running.has(c.id)) return false;
    const at = c.scheduleAt ?? "";
    if (c.scheduleType === "once") {
      return c.status === "programada" && Boolean(at) && new Date(at).getTime() <= now.getTime();
    }
    const [h, m] = String(at).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return false;
    const timeMatches = now.getHours() === h && now.getMinutes() === m;
    if (!timeMatches || c.lastRunDay === todayKey()) return false;
    if (c.scheduleType === "daily") return true;
    if (c.scheduleType === "weekly") return (c.scheduleDays ?? []).includes(now.getDay());
    return false;
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.campaign.findMany({
      where: { status: { in: ["programada", "activa"] } },
    });
    for (const c of candidates) {
      if (this.isDue(c, now)) {
        this.logger.log(`Disparando campaña "${c.name}" (${c.workspaceSlug}).`);
        void this.run(c.workspaceSlug, c.id).catch((e) =>
          this.logger.warn(`Campaña ${c.id}: ${(e as Error).message}`),
        );
      }
    }
  }

  /** Execute a campaign now: deliver to each target group and log the result. */
  async run(workspaceSlug: string, campaignId: string): Promise<void> {
    if (!this.prisma.enabled) throw new Error("Base de datos no configurada.");
    if (this.running.has(campaignId)) return;
    this.running.add(campaignId);
    try {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: campaignId, workspaceSlug },
        include: { targets: { include: { group: true } } },
      });
      if (!campaign) throw new Error("Campaña no encontrada.");

      const attachments = (campaign.attachments as Attachment[]) ?? [];
      const waAttachment = attachments[0]?.url ? (attachments[0] as WhatsappAttachment) : null;
      const channels = campaign.channels as string[];
      const results: { ok: boolean }[] = [];

      if (channels.includes("wa")) {
        const connected = this.whatsapp.isConnected(workspaceSlug);
        for (const target of campaign.targets) {
          const group = target.group;
          const vars = { ...builtinVars(group.name), ...(await this.groupVars(group.id)) };
          const text = renderTemplate(campaign.message, vars);
          if (!connected) {
            results.push(await this.log(workspaceSlug, campaign, group, "wa", text, false, "WhatsApp no conectado"));
            continue;
          }
          try {
            const res = await this.whatsapp.sendToGroup(workspaceSlug, group.remoteJid ?? group.id, text, waAttachment);
            results.push(await this.log(workspaceSlug, campaign, group, "wa", text, true, null, res.id));
          } catch (err) {
            results.push(await this.log(workspaceSlug, campaign, group, "wa", text, false, (err as Error).message));
          }
          await sleep(this.groupDelayMs);
        }
      }

      // Social publishing (fb/ig) is wired by MetaPublisher in a later phase.
      await this.publishSocial(workspaceSlug, campaign, channels, attachments, results);

      const recurring = campaign.scheduleType === "daily" || campaign.scheduleType === "weekly";
      const allOk = results.length > 0 && results.every((r) => r.ok);
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: recurring ? "activa" : allOk ? "completada" : "programada",
          progress: 100,
          lastRunAt: new Date(),
          lastRunDay: todayKey(),
        },
      });
      await this.audit.record(workspaceSlug, "system", "campaign.run", campaignId);
    } finally {
      this.running.delete(campaignId);
    }
  }

  /** Publish the campaign to Facebook/Instagram via the Meta Graph API. */
  private async publishSocial(
    workspaceSlug: string,
    campaign: PCampaign,
    channels: string[],
    attachments: Attachment[],
    results: { ok: boolean }[],
  ): Promise<void> {
    const targets = (["facebook", "instagram"] as const).filter((t) =>
      channels.includes(t === "facebook" ? "fb" : "ig"),
    );
    if (!targets.length) return;
    const text = renderTemplate(campaign.message, builtinVars(""));
    const published = await this.meta.publish(workspaceSlug, targets, {
      message: text,
      attachments: attachments.filter((a) => a.url),
      format: campaign.socialFormat ?? null,
    });
    for (const r of published) {
      await this.prisma.sendLog.create({
        data: {
          workspaceSlug,
          campaignId: campaign.id,
          campaignName: campaign.name,
          groupName: r.target === "facebook" ? "Facebook" : "Instagram",
          target: r.target,
          postId: r.id ?? null,
          format: r.format ?? campaign.socialFormat ?? null,
          preview: text.slice(0, 140),
          ok: r.ok,
          error: r.error ?? null,
        },
      });
      results.push({ ok: r.ok });
    }
  }

  private async groupVars(groupId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.groupVariable.findMany({ where: { groupId } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  private async log(
    workspaceSlug: string,
    campaign: PCampaign,
    group: { id: string; name: string } | null,
    target: string,
    text: string,
    ok: boolean,
    error: string | null,
    postId?: string,
  ): Promise<{ ok: boolean }> {
    await this.prisma.sendLog.create({
      data: {
        workspaceSlug,
        campaignId: campaign.id,
        campaignName: campaign.name,
        groupId: group?.id ?? null,
        groupName: group?.name ?? (target === "wa" ? null : target),
        target,
        postId: postId ?? null,
        format: campaign.socialFormat ?? null,
        preview: text.slice(0, 140),
        ok,
        error,
      },
    });
    return { ok };
  }
}
