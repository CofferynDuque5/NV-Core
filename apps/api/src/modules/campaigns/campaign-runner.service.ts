import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Campaign as PCampaign } from "@prisma/client";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogger } from "../../common/audit-logger.service";
import { EventBus } from "../../core/events/event-bus.service";
import { JobManager } from "../../core/jobs/job-manager.service";
import { ProviderManager } from "../../providers/provider-manager.service";
import type { MediaAttachment, PublishInput, PublishResult } from "../../providers/provider.types";
import { builtinVars, renderTemplate } from "./render";

const TICK_MS = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayKey = () => new Date().toISOString().slice(0, 10);

type Attachment = { url?: string; kind?: string; mime?: string | null; filename?: string | null };

/**
 * Evaluates scheduled campaigns on a tick and dispatches each due campaign as a
 * Job (Job Manager → Queue Manager) so execution is async, retried and tracked.
 *
 * Delivery ALWAYS goes through the ProviderManager — this service never touches
 * WhatsApp/Meta directly. On completion it publishes a `campaign.completed`
 * event on the Event Bus (which n8n can orchestrate on).
 */
@Injectable()
export class CampaignRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignRunner.name);
  private readonly groupDelayMs: number;
  private readonly retryBaseMs: number;
  private readonly maxAttempts: number;
  private timer?: NodeJS.Timeout;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly providers: ProviderManager,
    private readonly jobs: JobManager,
    private readonly events: EventBus,
    private readonly audit: AuditLogger,
  ) {
    this.groupDelayMs = Number(process.env.WHATSAPP_GROUP_DELAY_MS ?? 4000);
    // Retry policy for transient/rate-limited sends (exponential backoff).
    this.retryBaseMs = Number(process.env.WHATSAPP_RETRY_BASE_MS ?? 1000);
    this.maxAttempts = Math.max(1, Number(process.env.WHATSAPP_MAX_ATTEMPTS ?? 3));
    void config; // reserved for future tuning
  }

  /**
   * Run a send that throws (WhatsApp), retrying with exponential backoff only
   * when the thrown error is classified `retriable` (rate-limit / transient).
   * Non-retriable errors (auth, media, recipient) fail fast — retrying them
   * would only burn quota and delay the operator's alert.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const retriable = Boolean((err as { retriable?: boolean })?.retriable);
        if (!retriable || attempt === this.maxAttempts - 1) throw err;
        await sleep(this.retryBaseMs * 2 ** attempt);
      }
    }
    throw lastErr;
  }

  /**
   * Run a publish that returns a result (Meta), retrying with backoff while the
   * result is a failure flagged `retriable`. Returns the final result either way.
   */
  private async publishWithRetry(
    workspaceSlug: string,
    target: "facebook" | "instagram",
    input: PublishInput,
  ): Promise<PublishResult> {
    let result = await this.providers.publish(workspaceSlug, target, input);
    for (let attempt = 1; attempt < this.maxAttempts && !result.ok && result.retriable; attempt++) {
      await sleep(this.retryBaseMs * 2 ** (attempt - 1));
      result = await this.providers.publish(workspaceSlug, target, input);
    }
    return result;
  }

  onModuleInit(): void {
    // The actual execution runs as a job (async + retries + state).
    this.jobs.register("campaign.run", async (payload) => {
      const p = payload as { workspaceSlug: string; campaignId: string };
      await this.run(p.workspaceSlug, p.campaignId);
      return { ok: true };
    });

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

  /**
   * The due time-slot for a campaign at `now`, or null if it shouldn't run.
   * - "once": sentinel "once" when its datetime has passed and it's still scheduled.
   * - "daily"/"weekly": matches ANY of `scheduleTimes` (or `scheduleAt` when empty),
   *   deduped per slot ("YYYY-MM-DDTHH:MM") so it can run several times a day.
   */
  private dueSlot(c: PCampaign, now: Date): string | null {
    if (c.status === "pausada" || c.status === "completada") return null;
    const at = c.scheduleAt ?? "";
    if (c.scheduleType === "once") {
      return c.status === "programada" && Boolean(at) && new Date(at).getTime() <= now.getTime()
        ? "once"
        : null;
    }
    if (c.scheduleType === "weekly" && !(c.scheduleDays ?? []).includes(now.getDay())) return null;
    const times = c.scheduleTimes?.length ? c.scheduleTimes : at ? [at] : [];
    const matched = times.find((t) => {
      const [h, m] = String(t).split(":").map(Number);
      return !Number.isNaN(h) && now.getHours() === h && now.getMinutes() === m;
    });
    if (!matched) return null;
    const slot = `${todayKey()}T${matched}`;
    return c.lastRunSlot === slot ? null : slot;
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.campaign.findMany({
      where: { status: { in: ["programada", "activa"] } },
    });
    for (const c of candidates) {
      const slot = this.dueSlot(c, now);
      if (!slot) continue;
      this.logger.log(`Encolando campaña "${c.name}" (${c.workspaceSlug}) — franja ${slot}.`);
      // Mark the slot now so the next tick doesn't re-enqueue the same run.
      const dedupe = slot === "once" ? { lastRunDay: todayKey() } : { lastRunSlot: slot };
      await this.prisma.campaign.update({ where: { id: c.id }, data: dedupe }).catch(() => undefined);
      await this.jobs.dispatch("campaign.run", c.workspaceSlug, {
        workspaceSlug: c.workspaceSlug,
        campaignId: c.id,
      });
    }
  }

  /** Execute a campaign now: deliver to each target and log every result. */
  async run(workspaceSlug: string, campaignId: string): Promise<void> {
    if (!this.prisma.enabled) throw new Error("Base de datos no configurada.");
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceSlug },
      include: { targets: { include: { group: true } } },
    });
    if (!campaign) throw new Error("Campaña no encontrada.");

    const attachments = (campaign.attachments as Attachment[]) ?? [];
    const waAttachment = attachments[0]?.url ? (attachments[0] as MediaAttachment) : null;
    const channels = campaign.channels as string[];
    const results: { ok: boolean }[] = [];

    // Deliver to every target group via the provider matching its channel:
    // WhatsApp (Baileys/Cloud) or Telegram (bot). Social (fb/ig) is separate.
    for (const target of campaign.targets) {
      const group = target.group;
      // Group.channel defaults to "wa"; only Telegram routes elsewhere.
      const ch = group.channel === "tg" ? "tg" : "wa";
      const provider = ch === "tg" ? "telegram" : "whatsapp";
      const vars = { ...builtinVars(group.name), ...(await this.groupVars(group.id)) };
      const text = renderTemplate(campaign.message, vars);
      const to = group.remoteJid ?? group.id;
      try {
        const res = await this.withRetry(() =>
          ch === "wa" && waAttachment
            ? this.providers.sendMedia(workspaceSlug, provider, { to, body: text, attachment: waAttachment })
            : this.providers.sendMessage(workspaceSlug, provider, { to, body: text }),
        );
        results.push(await this.log(workspaceSlug, campaign, group, ch, text, true, null, res.id));
      } catch (err) {
        results.push(await this.log(workspaceSlug, campaign, group, ch, text, false, (err as Error).message));
      }
      await sleep(this.groupDelayMs);
    }

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
    this.events.emit("campaign.completed", {
      workspaceSlug,
      campaignId,
      campaignName: campaign.name,
      ok: allOk,
    });
  }

  /** Publish the campaign to Facebook/Instagram via the ProviderManager. */
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
    for (const target of targets) {
      const r = await this.publishWithRetry(workspaceSlug, target, {
        message: text,
        attachments: attachments.filter((a) => a.url) as MediaAttachment[],
        format: campaign.socialFormat ?? null,
      });
      await this.prisma.sendLog.create({
        data: {
          workspaceSlug,
          campaignId: campaign.id,
          campaignName: campaign.name,
          groupName: target === "facebook" ? "Facebook" : "Instagram",
          target,
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
