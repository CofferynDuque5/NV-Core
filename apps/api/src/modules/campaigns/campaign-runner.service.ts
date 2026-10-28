import { randomUUID } from "node:crypto";

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Campaign as PCampaign } from "@prisma/client";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogger } from "../../common/audit-logger.service";
import { EventBus } from "../../core/events/event-bus.service";
import { JobManager } from "../../core/jobs/job-manager.service";
import { ProviderManager } from "../../providers/provider-manager.service";
import { NotificationsService } from "../notifications/notifications.module";
import type { MediaAttachment, ProviderId, PublishInput, PublishResult } from "../../providers/provider.types";
import { builtinVars, renderTemplate } from "./render";
import { resolvePacing, pacingDelay, type PacingOptions } from "./pacing";

const TICK_MS = 30_000;
/** Minimum spacing between two runs of the same campaign (double click / retries). */
const RUN_GUARD_MS = 90_000;
/** Historial marker while a send to a chat is in progress (replaced by the outcome). */
const IN_FLIGHT = "en curso…";
/**
 * Outcome written over an "en curso" marker whose process died mid-send. The
 * provider may or may not have delivered it, so it is NOT resent (a duplicate
 * in a chat is worse than a gap) and NOT shown as a success.
 */
export const UNCONFIRMED =
  "Sin confirmar: el servidor se reinició durante este envío. No se reenvió para evitar duplicados; revisa el chat.";
/** An "en curso" marker older than this belongs to a dead process (a single send never takes this long). */
const ORPHAN_MARKER_MS = 30 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayKey = () => new Date().toISOString().slice(0, 10);

type Attachment = { url?: string; kind?: string; mime?: string | null; filename?: string | null };

/** Payload of a `campaign.run` job. `runKey` is the idempotency key of the run. */
export interface CampaignRunPayload {
  workspaceSlug: string;
  campaignId: string;
  runKey?: string;
  /** Set by the recovery sweep: continue an interrupted run instead of starting one. */
  resume?: boolean;
}

/** What a run actually did — a skipped run is reported as such, never as a success. */
export type CampaignRunOutcome =
  | { status: "completed"; ok: boolean; sent: number; failed: number }
  | { status: "paused" }
  | { status: "skipped"; reason: string };

/** Idempotency key of a scheduled slot: once → "once:<scheduleAt>", recurring → the slot itself. */
export function slotRunKey(slot: string, scheduleAt: string | null | undefined): string {
  return slot === "once" ? `once:${scheduleAt ?? ""}` : slot;
}

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002";

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
  /**
   * How late a daily/weekly slot may still fire (catch-up window). A locally
   * hosted app isn't always running at the exact scheduled minute; within this
   * window it sends when it comes online. Beyond it, the slot waits for next day.
   */
  private static readonly CATCHUP_MS = 3 * 60 * 60 * 1000; // 3h
  /** Anti-ban pacing between bulk sends (jittered window + periodic cool-down). */
  private readonly pacing: PacingOptions;
  private readonly retryBaseMs: number;
  private readonly maxAttempts: number;
  /**
   * A run whose heartbeat is older than this is considered dead (process
   * restarted / crashed) and is resumed by the next tick. Must exceed the
   * longest legit gap between heartbeats: pacing cool-down + a send with retries.
   */
  private readonly staleRunMs: number;
  private timer?: NodeJS.Timeout;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly providers: ProviderManager,
    private readonly jobs: JobManager,
    private readonly events: EventBus,
    private readonly audit: AuditLogger,
    private readonly notifications: NotificationsService,
  ) {
    this.pacing = resolvePacing(process.env);
    // Retry policy for transient/rate-limited sends (exponential backoff).
    this.retryBaseMs = Number(process.env.WHATSAPP_RETRY_BASE_MS ?? 1000);
    this.maxAttempts = Math.max(1, Number(process.env.WHATSAPP_MAX_ATTEMPTS ?? 3));
    this.staleRunMs = Math.max(60_000, Number(process.env.CAMPAIGN_RUN_STALE_MS ?? 10 * 60 * 1000));
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
    this.jobs.register("campaign.run", async (payload, ctx) => {
      const p = payload as CampaignRunPayload;
      // A retry (attempt > 1) continues the same run key: chats already claimed
      // by the failed attempt are skipped, the rest are sent.
      return this.run(p.workspaceSlug, p.campaignId, {
        runKey: p.runKey,
        resume: p.resume,
        attempt: ctx?.attempt,
      });
    });

    if (!this.prisma.enabled) {
      this.logger.log("CampaignRunner inactivo (sin base de datos).");
      return;
    }
    // Un fallo puntual (p. ej. la base de datos no responde un instante) no debe
    // tumbar el proceso entero: se registra y se reintenta en el siguiente tick.
    this.timer = setInterval(
      () =>
        void this.tick().catch((err: unknown) =>
          this.logger.warn(`Tick del runner falló: ${(err as Error).message}`),
        ),
      TICK_MS,
    );
    this.logger.log(`CampaignRunner activo (cada ${TICK_MS / 1000}s).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * The due time-slot for a campaign at `now`, or null if it shouldn't run.
   * - "once": sentinel "once" when its datetime has passed and it's still scheduled.
   * - "daily"/"weekly": fires a slot whose time has ARRIVED today, once per slot
   *   per day. Uses a catch-up window (not an exact-minute match) so a locally
   *   hosted app that wasn't running at the exact minute — e.g. the PC turned on
   *   a few minutes late — still sends when it comes online. Slots older than the
   *   window are skipped (they fire again the next day) to avoid odd-hour sends.
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
    for (const t of times) {
      const [h, m] = String(t).split(":").map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) continue;
      const slotTime = new Date(now);
      slotTime.setHours(h, m, 0, 0);
      const elapsed = now.getTime() - slotTime.getTime();
      if (elapsed < 0 || elapsed > CampaignRunner.CATCHUP_MS) continue; // not yet, or too old
      const slot = `${todayKey()}T${t}`;
      if (c.lastRunSlot !== slot) return slot; // due today and not yet run
    }
    return null;
  }

  private async tick(): Promise<void> {
    const now = new Date();
    await this.recoverInterruptedRuns(now);
    const candidates = await this.prisma.campaign.findMany({
      where: { status: { in: ["programada", "activa"] } },
    });
    for (const c of candidates) {
      const slot = this.dueSlot(c, now);
      if (!slot) continue;
      // SEGURO DE ENVÍO ÚNICO (atómico): en hosting con varias copias de la app
      // (Passenger levanta varios procesos) todas evaluaban la misma campaña a la
      // vez y la lanzaban por duplicado en el mismo instante. Aquí solo UN proceso
      // gana la "reserva" del turno (updateMany condicional); los demás ven
      // count=0 y no envían nada.
      const claim =
        slot === "once"
          ? await this.prisma.campaign.updateMany({
              where: { id: c.id, status: "programada" },
              data: { status: "activa", lastRunDay: todayKey() },
            })
          : await this.prisma.campaign.updateMany({
              where: { id: c.id, NOT: { lastRunSlot: slot } },
              data: { lastRunSlot: slot },
            });
      if (claim.count !== 1) continue; // otro proceso ya la reservó
      this.logger.log(`Encolando campaña "${c.name}" (${c.workspaceSlug}) — franja ${slot}.`);
      const payload: CampaignRunPayload = {
        workspaceSlug: c.workspaceSlug,
        campaignId: c.id,
        runKey: slotRunKey(slot, c.scheduleAt),
      };
      await this.jobs.dispatch("campaign.run", c.workspaceSlug, payload);
    }
  }

  /**
   * RECUPERACIÓN TRAS REINICIO. Sin Redis (cPanel) los jobs viven en memoria:
   * si el proceso se reinicia a mitad de una campaña, la ejecución se perdía,
   * la campaña "once" quedaba "activa" para siempre y los chats pendientes no
   * recibían nada, sin rastro en el Historial. Aquí:
   * 1. Las marcas «en curso» huérfanas pasan a «sin confirmar» (no éxito, no reenvío).
   * 2. Las ejecuciones con latido vencido se reanudan con la MISMA clave: los
   *    chats ya reclamados se saltan y solo se envía a los pendientes.
   */
  async recoverInterruptedRuns(now = new Date()): Promise<number> {
    if (!this.prisma.enabled) return 0;
    await this.prisma.sendLog.updateMany({
      where: { error: IN_FLIGHT, createdAt: { lt: new Date(now.getTime() - ORPHAN_MARKER_MS) } },
      data: { ok: false, error: UNCONFIRMED },
    });
    const stalled = await this.prisma.campaign.findMany({
      where: { runKey: { not: null }, runHeartbeatAt: { lt: new Date(now.getTime() - this.staleRunMs) } },
    });
    let resumed = 0;
    for (const c of stalled) {
      const runKey = c.runKey!;
      // Lo que estaba en curso cuando murió el proceso queda «sin confirmar».
      await this.prisma.sendLog.updateMany({
        where: { campaignId: c.id, runKey, error: IN_FLIGHT },
        data: { ok: false, error: UNCONFIRMED },
      });
      if (c.status === "pausada") {
        // Pausada por el usuario: no se reanuda; se libera la ejecución.
        await this.prisma.campaign.updateMany({
          where: { id: c.id, runKey },
          data: { runKey: null, runHeartbeatAt: null },
        });
        continue;
      }
      // Reserva atómica de la reanudación (un solo proceso la gana).
      const claim = await this.prisma.campaign.updateMany({
        where: { id: c.id, runKey, runHeartbeatAt: c.runHeartbeatAt },
        data: { runHeartbeatAt: now },
      });
      if (claim.count !== 1) continue;
      this.logger.warn(`Campaña "${c.name}" (${c.workspaceSlug}) interrumpida: se reanuda la ejecución ${runKey}.`);
      await this.audit.record(c.workspaceSlug, "system", "campaign.resumed", `${c.id} run=${runKey}`);
      const payload: CampaignRunPayload = { workspaceSlug: c.workspaceSlug, campaignId: c.id, runKey, resume: true };
      await this.jobs.dispatch("campaign.run", c.workspaceSlug, payload);
      resumed += 1;
    }
    return resumed;
  }

  /** «Enviar ahora»: encola la ejecución y devuelve al instante (la petición HTTP no espera minutos). */
  /**
   * Why «Enviar ahora» can't work right now, in words the user can act on
   * (nothing to send, no destination, a channel not connected). Empty when
   * the campaign can go. Without this the send was queued and every message
   * failed quietly into the Historial.
   */
  async problems(workspaceSlug: string, campaignId: string): Promise<string[]> {
    if (!this.prisma.enabled) return [];
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceSlug },
      include: { targets: { include: { group: { select: { channel: true, workspaceSlug: true } } } } },
    });
    if (!campaign) return ["Campaña no encontrada."];
    const out: string[] = [];
    const attachments = ((campaign.attachments as Attachment[]) ?? []).filter((a) => a.url);
    if (!campaign.message.trim() && attachments.length === 0) out.push("La campaña no tiene mensaje ni imagen.");
    const groups = campaign.targets.map((t) => t.group).filter((g) => g && g.workspaceSlug === workspaceSlug);
    const channels = campaign.channels as string[];
    const social = channels.filter((c) => c === "fb" || c === "ig");
    if (groups.length === 0 && social.length === 0 && !campaign.postToWaStatus) {
      out.push("Elige al menos un grupo o una red social de destino.");
    }
    const needed = new Set<ProviderId>();
    for (const g of groups) needed.add(g?.channel === "tg" ? "telegram" : "whatsapp");
    if (campaign.postToWaStatus) needed.add("whatsapp");
    if (channels.includes("fb")) needed.add("facebook");
    if (channels.includes("ig")) needed.add("instagram");
    const label: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram", facebook: "Facebook", instagram: "Instagram" };
    for (const id of needed) {
      const st = await this.providers.status(workspaceSlug, id).catch(() => null);
      if (st?.state !== "connected") {
        out.push(`${label[id] ?? id} no está conectado${st?.detail ? ` (${st.detail})` : ""}. Conéctalo en Conexiones.`);
      }
    }
    return out;
  }

  async enqueue(workspaceSlug: string, campaignId: string): Promise<void> {
    // The key is fixed BEFORE dispatch so a job retry continues this same run.
    const payload: CampaignRunPayload = { workspaceSlug, campaignId, runKey: `manual:${randomUUID()}` };
    await this.jobs.dispatch("campaign.run", workspaceSlug, payload);
  }

  /** Execute a campaign now: deliver to each target and log every result. */
  async run(
    workspaceSlug: string,
    campaignId: string,
    opts: { runKey?: string; resume?: boolean; attempt?: number } = {},
  ): Promise<CampaignRunOutcome> {
    if (!this.prisma.enabled) throw new Error("Base de datos no configurada.");
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceSlug },
      include: { targets: { include: { group: true } } },
    });
    if (!campaign) throw new Error("Campaña no encontrada.");

    const runKey = opts.runKey ?? `manual:${randomUUID()}`;
    const manual = runKey.startsWith("manual:");
    const startedAt = new Date();
    const skip = (reason: string): CampaignRunOutcome => {
      this.logger.warn(`Campaña "${campaign.name}": ${reason}`);
      return { status: "skipped", reason };
    };
    // Reanudar = continuar una ejecución que este mismo runKey dejó a medias
    // (reinicio detectado por el barrido, o reintento del job tras un error).
    const resuming = campaign.runKey === runKey && (opts.resume === true || (opts.attempt ?? 1) > 1);
    if (opts.resume && !resuming) return skip("la ejecución a reanudar ya terminó; no se repite.");

    if (resuming) {
      const claim = await this.prisma.campaign.updateMany({
        where: { id: campaignId, runKey, runHeartbeatAt: campaign.runHeartbeatAt },
        data: { runHeartbeatAt: startedAt },
      });
      if (claim.count !== 1) return skip("otro proceso ya reanudó esta ejecución; no se duplica.");
    } else {
      // SEGURO 1 — una sola ejecución a la vez por campaña. Cubre el doble clic en
      // «Enviar ahora», el reintento del navegador cuando la petición tarda, y dos
      // procesos del hosting corriendo la misma campaña: solo gana quien logra la
      // reserva atómica sobre lastRunAt/runKey; y nunca se relanza en menos de 90 s.
      if (campaign.lastRunAt && startedAt.getTime() - campaign.lastRunAt.getTime() < RUN_GUARD_MS) {
        return skip(`ya se ejecutó hace <${RUN_GUARD_MS / 1000}s; no se repite.`);
      }
      const heartbeat = campaign.runHeartbeatAt?.getTime() ?? 0;
      if (campaign.runKey && startedAt.getTime() - heartbeat < this.staleRunMs) {
        return skip("ya hay una ejecución en curso; no se duplica.");
      }
      const claim = await this.prisma.campaign.updateMany({
        where: { id: campaignId, lastRunAt: campaign.lastRunAt, runKey: campaign.runKey },
        data: { lastRunAt: startedAt, runKey, runHeartbeatAt: startedAt, progress: 0 },
      });
      if (claim.count !== 1) return skip("ya está en ejecución en otro proceso; no se duplica.");
    }

    const attachments = (campaign.attachments as Attachment[]) ?? [];
    const withUrl = attachments.filter((a) => a.url);
    // Image rotation: when enabled and there are several images, this run uses the
    // next one in turn (round-robin) instead of always the first — so a daily
    // campaign varies its creative. The cursor is advanced after the run.
    const rotate = campaign.rotateAttachments && withUrl.length > 1;
    const rotIndex = rotate ? campaign.attachmentRotation % withUrl.length : 0;
    const rotated = withUrl[rotIndex] ?? null;
    const waAttachment = rotated?.url ? (rotated as MediaAttachment) : null;
    // The single image WhatsApp Status uses (the rotated one when rotating).
    const statusMedia = rotate ? (rotated ? [rotated] : []) : withUrl;
    const channels = campaign.channels as string[];
    const results: { ok: boolean }[] = [];

    // Deliver to every target group via the provider matching its channel:
    // WhatsApp (Baileys/Cloud) or Telegram (bot). Social (fb/ig) is separate.
    // Between sends we wait a randomized, human-like gap (anti-ban) instead of a
    // fixed cadence — with a longer cool-down after each batch.
    let sent = 0;
    let paused = false;
    const total = campaign.targets.length;
    for (const target of campaign.targets) {
      const group = target.group;
      // SEGURO 2 — «Pausar» detiene de verdad: se relee el estado antes de CADA
      // envío y, si la campaña se pausó, se corta aquí (no al terminar la lista).
      const fresh = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true },
      });
      if (fresh?.status === "pausada") {
        paused = true;
        this.logger.warn(`Campaña "${campaign.name}" pausada por el usuario: envío detenido.`);
        break;
      }
      // Defense-in-depth: never send to a group that isn't this workspace's own
      // (e.g. a stale target left after switching accounts). Targeting is already
      // validated on write, but this guarantees the historial never shows sends
      // to groups that don't belong to this workspace's WhatsApp/Telegram.
      if (!group || group.workspaceSlug !== workspaceSlug) continue;
      // Latido: demuestra que esta ejecución sigue viva y publica el progreso.
      // Si otro proceso tomó la ejecución (count=0), esta se detiene: nunca dos
      // bucles de envío sobre la misma campaña.
      const alive = await this.prisma.campaign.updateMany({
        where: { id: campaignId, runKey },
        data: { runHeartbeatAt: new Date(), progress: Math.floor((sent / Math.max(1, total)) * 100) },
      });
      if (alive.count !== 1) {
        this.logger.warn(`Campaña "${campaign.name}": otra ejecución tomó el relevo; este proceso se detiene.`);
        return { status: "skipped", reason: "otra ejecución tomó el relevo." };
      }
      // ANTI-SPAM (solo «Enviar ahora»): si este chat YA recibió este mensaje con
      // éxito en las últimas 20 h, un envío manual no lo repite. Las franjas
      // programadas no usan esta ventana: cada franja tiene su propia clave, así
      // las campañas «varias veces al día» envían en TODAS sus horas.
      if (manual) {
        const dup = await this.prisma.sendLog.findFirst({
          where: {
            workspaceSlug,
            campaignId: campaign.id,
            groupId: group.id,
            ok: true,
            createdAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) },
          },
          select: { id: true },
        });
        if (dup) {
          sent += 1;
          continue; // ya enviado a este chat; no duplicar
        }
      }
      // Group.channel defaults to "wa"; only Telegram routes elsewhere.
      const ch = group.channel === "tg" ? "tg" : "wa";
      const provider = ch === "tg" ? "telegram" : "whatsapp";
      const vars = { ...builtinVars(group.name), ...(await this.groupVars(group.id)) };
      const text = renderTemplate(campaign.message, vars);
      const to = group.remoteJid ?? group.id;
      // SEGURO 3 — reserva del chat ANTES de enviar: la fila «en curso» es única
      // por (campaña, chat, ejecución) en la base de datos. Si ya existe (otro
      // proceso, un reintento o la reanudación tras un reinicio), este chat ya fue
      // atendido en esta ejecución y NO se reenvía. La marca pasa a ser el resultado.
      let marker: { id: string };
      try {
        marker = await this.prisma.sendLog.create({
          data: {
            workspaceSlug,
            campaignId: campaign.id,
            campaignName: campaign.name,
            groupId: group.id,
            groupName: group.name,
            target: ch,
            format: campaign.socialFormat ?? null,
            preview: text.slice(0, 140),
            ok: false,
            error: IN_FLIGHT,
            runKey,
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        sent += 1;
        continue; // ya reclamado en esta ejecución; no duplicar
      }
      const finish = async (ok: boolean, error: string | null, postId?: string) => {
        await this.prisma.sendLog.update({
          where: { id: marker.id },
          data: { ok, error, postId: postId ?? null },
        });
        return { ok };
      };
      try {
        let mediaNote: string | null = null;
        const res = await this.withRetry(async () => {
          if (!waAttachment) return this.providers.sendMessage(workspaceSlug, provider, { to, body: text });
          try {
            return await this.providers.sendMedia(workspaceSlug, provider, {
              to,
              body: text,
              attachment: waAttachment,
            });
          } catch (err) {
            // Only the MEDIA failed (download / file rejected): deliver the text
            // anyway and leave the reason in the Historial, instead of silently
            // dropping the whole message or the image without a trace.
            if (!(err as { mediaFailed?: boolean })?.mediaFailed) throw err;
            mediaNote = `Imagen NO enviada, se envió solo el texto: ${(err as Error).message}`;
            this.logger.warn(`[${workspaceSlug}] ${group.name}: ${mediaNote}`);
            return this.providers.sendMessage(workspaceSlug, provider, { to, body: text });
          }
        });
        results.push(await finish(true, mediaNote, res.id));
      } catch (err) {
        results.push(await finish(false, (err as Error).message));
      }
      sent += 1;
      // No trailing wait after the final target.
      if (sent < total) await sleep(pacingDelay(sent, this.pacing));
    }

    if (paused) {
      // Se libera la ejecución; al «Reanudar», una campaña "once" vuelve con la
      // misma clave y solo envía a los chats que faltaban.
      await this.prisma.campaign.updateMany({
        where: { id: campaignId, runKey },
        data: { runKey: null, runHeartbeatAt: null },
      });
      await this.audit.record(workspaceSlug, "system", "campaign.paused", campaignId);
      return { status: "paused" }; // nada de redes ni Estado, y no se marca completada
    }

    await this.publishSocial(workspaceSlug, campaign, channels, attachments, results, runKey);
    if (campaign.postToWaStatus) {
      await this.publishWaStatus(workspaceSlug, campaign, statusMedia, results, runKey);
    }

    const recurring = campaign.scheduleType === "daily" || campaign.scheduleType === "weekly";
    // El resultado se calcula sobre TODA la ejecución (incluida la parte anterior
    // a un reinicio), no solo sobre lo enviado por este proceso.
    const [okCount, failedCount] = await Promise.all([
      this.prisma.sendLog.count({ where: { campaignId, runKey, ok: true } }),
      this.prisma.sendLog.count({ where: { campaignId, runKey, ok: false } }),
    ]);
    const allOk = okCount > 0 && failedCount === 0;
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        // ANTI-SPAM: una campaña de una sola vez ("once") queda COMPLETADA tras
        // correr, aunque algún envío falle. Antes, si algún destino fallaba (p.ej.
        // "rate-overlimit"), se quedaba "programada" y se REENVIABA en cada tick,
        // mandando el mensaje varias veces al mismo chat (riesgo de ban).
        status: recurring ? "activa" : "completada",
        progress: 100,
        lastRunAt: new Date(),
        lastRunDay: todayKey(),
        runKey: null,
        runHeartbeatAt: null,
        // Advance the rotation cursor so the next run picks the following image.
        ...(rotate ? { attachmentRotation: campaign.attachmentRotation + 1 } : {}),
      },
    });
    await this.audit.record(workspaceSlug, "system", "campaign.run", campaignId);
    await this.noticeResult(workspaceSlug, campaign.name, runKey, okCount, failedCount);
    this.events.emit("campaign.completed", {
      workspaceSlug,
      campaignId,
      campaignName: campaign.name,
      ok: allOk,
    });
    return { status: "completed", ok: allOk, sent: okCount, failed: failedCount };
  }

  /**
   * Tell the team how the run went (in-app only): how many went out and, when
   * some failed, the first reason — so a broken session is seen at once
   * instead of only in the Historial. A failed notice never fails the run.
   */
  private async noticeResult(
    workspaceSlug: string,
    name: string,
    runKey: string,
    ok: number,
    failed: number,
  ): Promise<void> {
    const total = ok + failed;
    if (total === 0) return;
    try {
      let reason = "";
      if (failed > 0) {
        const first = await this.prisma.sendLog.findFirst({
          where: { workspaceSlug, runKey, ok: false },
          select: { error: true, groupName: true },
          orderBy: { createdAt: "asc" },
        });
        if (first?.error) reason = ` Motivo${first.groupName ? ` (${first.groupName})` : ""}: ${first.error.slice(0, 160)}`;
      }
      await this.notifications.create(workspaceSlug, {
        type: failed === 0 ? "success" : ok === 0 ? "error" : "warning",
        title: failed === 0 ? `Campaña «${name}» enviada` : `Campaña «${name}»: ${failed} de ${total} envíos fallaron`,
        meta: `${ok} de ${total} enviados.${reason} Detalle en Historial.`,
      });
    } catch (err) {
      this.logger.warn(`No se pudo avisar del resultado de la campaña: ${(err as Error).message}`);
    }
  }

  /**
   * True when this run already logged a publish to `target` (FB/IG/Estado) —
   * a resumed run must not publish the same post twice.
   */
  private async alreadyPublished(campaignId: string, runKey: string, target: string): Promise<boolean> {
    const row = await this.prisma.sendLog.findFirst({
      where: { campaignId, runKey, target },
      select: { id: true },
    });
    return Boolean(row);
  }

  /** Publish the campaign to Facebook/Instagram via the ProviderManager. */
  private async publishSocial(
    workspaceSlug: string,
    campaign: PCampaign,
    channels: string[],
    attachments: Attachment[],
    results: { ok: boolean }[],
    runKey: string,
  ): Promise<void> {
    const targets = (["facebook", "instagram"] as const).filter((t) =>
      channels.includes(t === "facebook" ? "fb" : "ig"),
    );
    if (!targets.length) return;
    const text = renderTemplate(campaign.message, builtinVars(""));
    for (const target of targets) {
      if (await this.alreadyPublished(campaign.id, runKey, target)) continue;
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
          runKey,
        },
      });
      results.push({ ok: r.ok });
    }
  }

  /**
   * Publish the campaign to the workspace's WhatsApp Status (Estados) via the
   * ProviderManager (Baileys adapter's publish). Retries on a `retriable`
   * failure (dropped socket / rate-limit) and logs the outcome to the Historial.
   */
  private async publishWaStatus(
    workspaceSlug: string,
    campaign: PCampaign,
    media: Attachment[],
    results: { ok: boolean }[],
    runKey: string,
  ): Promise<void> {
    if (await this.alreadyPublished(campaign.id, runKey, "wa_status")) return;
    const text = renderTemplate(campaign.message, builtinVars(""));
    const input: PublishInput = {
      message: text,
      attachments: media.filter((a) => a.url) as MediaAttachment[],
      format: "status",
    };
    let r = await this.providers.publish(workspaceSlug, "whatsapp", input);
    for (let attempt = 1; attempt < this.maxAttempts && !r.ok && r.retriable; attempt++) {
      await sleep(this.retryBaseMs * 2 ** (attempt - 1));
      r = await this.providers.publish(workspaceSlug, "whatsapp", input);
    }
    await this.prisma.sendLog.create({
      data: {
        workspaceSlug,
        campaignId: campaign.id,
        campaignName: campaign.name,
        groupName: "Estado de WhatsApp",
        target: "wa_status",
        postId: r.id ?? null,
        format: "status",
        preview: text.slice(0, 140),
        ok: r.ok,
        error: r.error ?? null,
        runKey,
      },
    });
    results.push({ ok: r.ok });
  }

  private async groupVars(groupId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.groupVariable.findMany({ where: { groupId } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

}
