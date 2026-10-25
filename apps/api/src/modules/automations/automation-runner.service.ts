import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { AutomationEdge, AutomationNode, AutomationTraceStep } from "@nv/domain";

import { EventBus } from "../../core/events/event-bus.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ProviderManager } from "../../providers/provider-manager.service";
import { AiService } from "../ai/ai.module";
import { ConsentService, isOptOutMessage } from "../consent/consent.service";
import { NotificationsService } from "../notifications/notifications.module";

/**
 * Ejecuta las automatizaciones DE VERDAD (no solo dry-run): al llegar un mensaje
 * (WhatsApp/Telegram) recorre cada flujo activo del workspace cuyo disparador
 * sea "mensaje entrante" y ejecuta sus acciones: respuesta con IA, mensaje fijo,
 * crear contacto, notificar y escalar a humano. Las condiciones se evalúan
 * contra el contexto del mensaje (intención, resuelto, canal…).
 *
 * Seguros anti-spam: nunca responde a mensajes propios y da una sola respuesta
 * por chat cada 30 s (aunque haya varios flujos).
 *
 * Nodo «esperar»: el flujo se pausa y queda guardado en `AutomationWait` con la
 * hora de reanudación. Un tick cada 30 s reanuda las esperas vencidas desde el
 * nodo siguiente, así funciona sin Redis y tras un reinicio. Solo hay una espera
 * pendiente por flujo + contacto + nodo (un cliente que escribe 5 veces no
 * recibe 5 seguimientos), y una espera cortada por un reinicio a mitad de
 * ejecución se marca como fallida «sin confirmar» en vez de repetirse.
 *
 * Historial: cada ejecución real (mensaje entrante o reanudación) se guarda en
 * `AutomationRun` con los pasos recorridos y por qué se omitió cada acción
 * (pausa anti-spam, contacto dado de baja, sin respuesta de la IA…). Se
 * conserva 30 días.
 */
const COOLDOWN_MS = 30_000;
const TICK_MS = 30_000;
/** Esperas reanudadas por tick, para no acaparar el proceso. */
const RESUME_BATCH = 20;
/** Una espera "running" más tiempo que esto fue interrumpida por un reinicio. */
const STUCK_RUNNING_MS = 10 * 60_000;
/** Tope de una espera, para que un valor erróneo no deje flujos colgados años. */
const MAX_WAIT_MS = 30 * 86_400_000;
/** Días que se conserva el historial de ejecuciones. */
const RUN_RETENTION_MS = 30 * 86_400_000;
export const WAIT_UNCONFIRMED =
  "Sin confirmar: el servidor se reinició mientras se reanudaba el flujo. No se repite para no duplicar envíos.";

interface IncomingMessage {
  workspaceSlug: string;
  channel: string;
  contactHandle: string;
  contactName: string;
  text: string;
}

interface WaitPayload {
  message: IncomingMessage;
  context: Record<string, string>;
}

/** Lo que una ejecución va dejando para el historial. */
interface RunTrace {
  steps: AutomationTraceStep[];
  /** Terminó pausada en un nodo «esperar». */
  waiting: boolean;
}

interface ActionResult {
  ok: boolean;
  note: string;
}

const COOLDOWN_NOTE = "Omitido: ya se respondió a este chat hace menos de 30 s (anti-spam).";
const OPTED_OUT_NOTE = "Omitido: el contacto está dado de baja.";

const done = (note: string): ActionResult => ({ ok: true, note });
const skipped = (note: string): ActionResult => ({ ok: false, note });

/** Duración del nodo «esperar»: "5m", "1h", "1d", "3d" o {minutes|hours|days}. */
export function waitDurationMs(config: Record<string, unknown>): number | null {
  const raw = config.duration;
  const m = typeof raw === "string" ? /^\s*(\d+)\s*(m|h|d)\s*$/i.exec(raw) : null;
  let ms: number | null = null;
  if (m) {
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]!.toLowerCase() as "m" | "h" | "d"];
    ms = Number(m[1]) * unit;
  } else {
    const n = (k: string) => (typeof config[k] === "number" ? (config[k] as number) : Number(config[k] ?? 0)) || 0;
    const total = n("minutes") * 60_000 + n("hours") * 3_600_000 + n("days") * 86_400_000;
    ms = total > 0 ? total : null;
  }
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, MAX_WAIT_MS);
}
const str = (v: unknown): string => (v == null ? "" : String(v));
const cfg = (n: AutomationNode): Record<string, unknown> => n.config ?? {};

/** Palabras que marcan intención de compra / soporte (heurística barata). */
const BUY_WORDS = ["precio", "cuanto", "cuánto", "quiero", "comprar", "compra", "cuenta", "combo", "pago", "pagar", "vale"];
const HELP_WORDS = ["no funciona", "ayuda", "error", "no me deja", "no puedo", "problema", "pantalla en uso", "pin"];

@Injectable()
export class AutomationRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationRunnerService.name);
  private unsubscribe: (() => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  /** Último auto-envío por (workspace|handle) para el cooldown anti-spam. */
  private readonly lastReply = new Map<string, number>();

  constructor(
    private readonly events: EventBus,
    private readonly prisma: PrismaService,
    private readonly providers: ProviderManager,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
    private readonly consent: ConsentService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.on("message.received", (p) => this.onMessage(p));
    this.logger.log("Runner de automatizaciones activo (mensaje entrante → flujos).");
    if (!this.prisma.enabled) return;
    this.timer = setInterval(
      () =>
        void this.resumeDue().catch((err: unknown) =>
          this.logger.warn(`Reanudar esperas falló: ${(err as Error).message}`),
        ),
      TICK_MS,
    );
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    if (this.timer) clearInterval(this.timer);
  }

  private async onMessage(p: IncomingMessage): Promise<void> {
    if (!this.prisma.enabled || !p.text?.trim()) return;
    // "BAJA"/"STOP" lo registra ConsentService; ningún flujo debe contestarlo.
    if (isOptOutMessage(p.text)) return;
    const flows = await this.prisma.automation.findMany({
      where: { workspaceSlug: p.workspaceSlug, status: "activo" },
    });
    if (flows.length === 0) return;

    const low = p.text.toLowerCase();
    const context: Record<string, string> = {
      text: p.text,
      channel: p.channel,
      contactName: p.contactName,
      contactHandle: p.contactHandle,
      intent: BUY_WORDS.some((w) => low.includes(w))
        ? "compra"
        : HELP_WORDS.some((w) => low.includes(w))
          ? "soporte"
          : "consulta",
      resolved: "false",
    };

    for (const flow of flows) {
      const nodes = (flow.nodes as unknown as AutomationNode[]) ?? [];
      const edges = (flow.edges as unknown as AutomationEdge[]) ?? [];
      const trigger = nodes.find((n) => n.type === "trigger");
      if (!trigger || !this.triggerMatches(trigger, low)) continue;
      const trace: RunTrace = { steps: [], waiting: false };
      const startedAt = new Date();
      try {
        const ran = await this.walk(flow.id, p, nodes, edges, trigger.id, { ...context }, false, trace);
        if (ran) {
          await this.prisma.automation
            .update({ where: { id: flow.id }, data: { runs: { increment: 1 } } })
            .catch(() => undefined);
        }
        await this.recordRun(flow.id, "message", p, trace, ran, null, startedAt);
      } catch (err) {
        const reason = (err as Error).message || "Error al ejecutar el flujo.";
        this.logger.warn(`Flujo "${flow.name}" falló: ${reason}`);
        await this.recordRun(flow.id, "message", p, trace, false, reason, startedAt);
      }
    }
  }

  /** El disparador aplica si es "mensaje entrante" y (si lo define) contiene alguna palabra clave. */
  private triggerMatches(trigger: AutomationNode, low: string): boolean {
    const c = cfg(trigger);
    const event = str(c.event) || "message.received";
    if (event !== "message.received" && event !== "manual") return false;
    const contains = Array.isArray(c.contains) ? (c.contains as unknown[]).map(str) : [];
    if (contains.length === 0) return true;
    return contains.some((w) => w && low.includes(w.toLowerCase()));
  }

  /**
   * Recorre el grafo desde `startId` ejecutando acciones; devuelve si hizo algo.
   * Un nodo «esperar» guarda la continuación y detiene el recorrido.
   */
  private async walk(
    flowId: string,
    p: IncomingMessage,
    nodes: AutomationNode[],
    edges: AutomationEdge[],
    startId: string,
    context: Record<string, string>,
    resumed: boolean,
    trace: RunTrace = { steps: [], waiting: false },
  ): Promise<boolean> {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const step = (n: AutomationNode, note: string, decision?: "true" | "false") =>
      trace.steps.push({ nodeId: n.id, type: n.type, label: n.label, note, ...(decision ? { decision } : {}) });
    const visited = new Set<string>();
    let current: AutomationNode | undefined = byId.get(startId);
    let didSomething = false;

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      let branch: "true" | "false" | undefined;

      if (current.type === "trigger") {
        step(current, `«${p.text.slice(0, 80)}»`);
      } else if (current.type === "action") {
        let result: ActionResult;
        try {
          result = await this.runAction(flowId, current, p, context, resumed);
        } catch (err) {
          step(current, `Error: ${(err as Error).message || "falló la acción"}`);
          throw err;
        }
        step(current, result.note);
        didSomething = result.ok || didSomething;
      } else if (current.type === "cond") {
        branch = this.evalCond(current, context) ? "true" : "false";
        step(current, branch === "true" ? "Se cumple." : "No se cumple.", branch);
      } else if (current.type === "wait") {
        const next = edges.find((e) => e.from === current!.id);
        // Una espera al final del flujo no tiene nada que reanudar.
        if (!next) {
          step(current, "Espera al final del flujo: no hay nada que reanudar.");
          break;
        }
        const ms = waitDurationMs(cfg(current));
        if (ms == null) {
          this.logger.warn(`Nodo de espera sin duración válida en flujo ${flowId} (${current.label}); se omite.`);
          step(current, "Sin duración válida: se omite la espera.");
        } else {
          const scheduled = await this.scheduleWait(flowId, current.id, next.to, p, context, ms);
          step(
            current,
            scheduled
              ? `En espera hasta ${new Date(Date.now() + ms).toISOString()}.`
              : "Este contacto ya tenía una espera pendiente en este paso.",
          );
          trace.waiting = scheduled;
          return scheduled || didSomething;
        }
      }

      const out = edges.filter((e) => e.from === current!.id);
      const next = branch ? (out.find((e) => e.branch === branch) ?? null) : (out[0] ?? null);
      current = next ? byId.get(next.to) : undefined;
    }
    return didSomething;
  }

  /** Condición: soporta {field, equals} o "campo=valor" en field. */
  private evalCond(node: AutomationNode, ctx: Record<string, string>): boolean {
    const c = cfg(node);
    let key = str(c.field).trim();
    let value = str(c.equals ?? c.value).trim();
    if (key.includes("=") && !value) {
      const i = key.indexOf("=");
      value = key.slice(i + 1).trim();
      key = key.slice(0, i).trim();
    }
    if (!key) return false;
    return str(ctx[key]).toLowerCase() === value.toLowerCase();
  }

  private async runAction(
    flowId: string,
    node: AutomationNode,
    p: IncomingMessage,
    ctx: Record<string, string>,
    resumed = false,
  ): Promise<ActionResult> {
    const c = cfg(node);
    const kind = (str(c.kind) || str(c.action)).replace(/-/g, "_");
    switch (kind) {
      case "ai_reply": {
        if (!resumed && !this.cooldownOk(p)) return skipped(COOLDOWN_NOTE);
        if (await this.consent.isHandleOptedOut(p.workspaceSlug, p.contactHandle)) return skipped(OPTED_OUT_NOTE);
        const { reply } = await this.ai.chat(p.workspaceSlug, {
          system: str(c.prompt) || undefined,
          messages: [{ role: "user", content: p.text }],
          mode: "ventas",
        });
        if (!reply) return skipped("La IA no devolvió respuesta.");
        if (!(await this.deliver(p, reply))) return skipped(OPTED_OUT_NOTE);
        // Si el cliente pidió ayuda y la IA no derivó, lo damos por resuelto.
        const low = reply.toLowerCase();
        ctx.resolved = /persona|humano|asesor|te paso con/.test(low) ? "false" : "true";
        return done(`Respuesta con IA enviada: «${reply.slice(0, 80)}»`);
      }
      case "send_message": {
        if (!resumed && !this.cooldownOk(p)) return skipped(COOLDOWN_NOTE);
        const body = str(c.body).replace(/\{\{\s*nombre\s*\}\}/gi, p.contactName || "");
        if (!body.trim()) return skipped("El mensaje está vacío.");
        return (await this.deliver(p, body)) ? done(`Mensaje enviado: «${body.slice(0, 80)}»`) : skipped(OPTED_OUT_NOTE);
      }
      case "create_contact": {
        const exists = await this.prisma.contact.findFirst({
          where: { workspaceSlug: p.workspaceSlug, phone: { contains: p.contactHandle.replace(/\D/g, "").slice(-9) } },
          select: { id: true },
        });
        if (exists) return skipped("El contacto ya existía.");
        const tag = str(c.tag).trim();
        await this.prisma.contact.create({
          data: {
            workspaceSlug: p.workspaceSlug,
            name: p.contactName || p.contactHandle,
            phone: p.contactHandle.startsWith("+") ? p.contactHandle : `+${p.contactHandle}`,
            tags: tag ? [tag] : [],
            stage: str(c.stage) || "Lead",
            lastContactAt: new Date(),
          },
        });
        return done(tag ? `Contacto creado con la etiqueta «${tag}».` : "Contacto creado.");
      }
      case "notify": {
        await this.notifications.create(p.workspaceSlug, {
          type: "info",
          title: str(c.title) || `Interesado: ${p.contactName || p.contactHandle}`,
          meta: p.text.slice(0, 140),
        });
        return done("Aviso enviado al equipo.");
      }
      case "assign_human": {
        await this.prisma.conversation.updateMany({
          where: { workspaceSlug: p.workspaceSlug, contactHandle: p.contactHandle },
          data: { labels: { push: "requiere-humano" } },
        });
        await this.notifications.create(p.workspaceSlug, {
          type: "warning",
          title: `Escalado a humano: ${p.contactName || p.contactHandle}`,
          meta: p.text.slice(0, 140),
        });
        return done("Conversación marcada «requiere-humano» y equipo avisado.");
      }
      default:
        this.logger.debug?.(`Acción desconocida "${kind}" en flujo ${flowId}; se omite.`);
        return skipped(`Acción desconocida «${kind || "sin tipo"}»: se omite.`);
    }
  }

  /** Guarda la continuación del flujo. Una sola espera pendiente por flujo + contacto + nodo. */
  private async scheduleWait(
    flowId: string,
    waitNodeId: string,
    nextNodeId: string,
    p: IncomingMessage,
    context: Record<string, string>,
    ms: number,
  ): Promise<boolean> {
    const pending = await this.prisma.automationWait.findFirst({
      where: { automationId: flowId, contactHandle: p.contactHandle, waitNodeId, status: "pending" },
      select: { id: true },
    });
    if (pending) return false;
    await this.prisma.automationWait.create({
      data: {
        workspaceSlug: p.workspaceSlug,
        automationId: flowId,
        waitNodeId,
        nextNodeId,
        contactHandle: p.contactHandle,
        payload: { message: p, context } satisfies WaitPayload as object,
        resumeAt: new Date(Date.now() + ms),
      },
    });
    return true;
  }

  /**
   * Reanuda las esperas vencidas. Cada una se reclama con un compare-and-set
   * (pending → running), así dos procesos nunca reanudan la misma.
   */
  async resumeDue(now = new Date()): Promise<number> {
    if (!this.prisma.enabled || this.ticking) return 0;
    this.ticking = true;
    try {
      await this.failStuck(now);
      await this.pruneRuns(now);
      const due = await this.prisma.automationWait.findMany({
        where: { status: "pending", resumeAt: { lte: now } },
        orderBy: { resumeAt: "asc" },
        take: RESUME_BATCH,
      });
      let resumed = 0;
      for (const w of due) {
        const claim = await this.prisma.automationWait.updateMany({
          where: { id: w.id, status: "pending" },
          data: { status: "running", startedAt: new Date() },
        });
        if (claim.count === 0) continue;
        resumed++;
        await this.resumeOne(w);
      }
      return resumed;
    } finally {
      this.ticking = false;
    }
  }

  private async resumeOne(w: {
    id: string;
    automationId: string;
    nextNodeId: string;
    workspaceSlug: string;
    payload: unknown;
  }): Promise<void> {
    const flow = await this.prisma.automation.findUnique({ where: { id: w.automationId } });
    // Pausar o borrar el flujo cancela sus esperas: no se envía nada.
    if (!flow || flow.status !== "activo" || flow.workspaceSlug !== w.workspaceSlug) {
      await this.finishWait(w.id, "cancelled", "El flujo ya no está activo.");
      return;
    }
    const nodes = (flow.nodes as unknown as AutomationNode[]) ?? [];
    const edges = (flow.edges as unknown as AutomationEdge[]) ?? [];
    if (!nodes.some((n) => n.id === w.nextNodeId)) {
      await this.finishWait(w.id, "cancelled", "El flujo cambió y el paso siguiente ya no existe.");
      return;
    }
    const { message, context } = w.payload as WaitPayload;
    const trace: RunTrace = { steps: [], waiting: false };
    const startedAt = new Date();
    try {
      const ran = await this.walk(flow.id, message, nodes, edges, w.nextNodeId, { ...context }, true, trace);
      await this.finishWait(w.id, "done", null);
      await this.recordRun(flow.id, "resume", message, trace, ran, null, startedAt);
    } catch (err) {
      const reason = (err as Error).message || "Error al reanudar el flujo.";
      await this.finishWait(w.id, "failed", reason);
      await this.recordRun(flow.id, "resume", message, trace, false, reason, startedAt);
      await this.notifications.create(w.workspaceSlug, {
        type: "error",
        title: `Automatización "${flow.name}" falló tras la espera`,
        meta: reason.slice(0, 140),
      });
      this.logger.warn(`Flujo "${flow.name}" falló al reanudar: ${reason}`);
    }
  }

  private async finishWait(id: string, status: "done" | "failed" | "cancelled", error: string | null) {
    await this.prisma.automationWait.updateMany({
      where: { id, status: "running" },
      data: { status, error },
    });
  }

  /** Esperas que quedaron "running" por un reinicio: fallidas sin confirmar, sin repetir envíos. */
  private async failStuck(now: Date): Promise<void> {
    await this.prisma.automationWait.updateMany({
      where: { status: "running", startedAt: { lte: new Date(now.getTime() - STUCK_RUNNING_MS) } },
      data: { status: "failed", error: WAIT_UNCONFIRMED },
    });
  }

  /** Guarda la ejecución en el historial. Nunca hace fallar el flujo. */
  private async recordRun(
    automationId: string,
    trigger: "message" | "resume",
    p: IncomingMessage,
    trace: RunTrace,
    didSomething: boolean,
    error: string | null,
    startedAt: Date,
  ): Promise<void> {
    const status = error ? "error" : trace.waiting ? "waiting" : didSomething ? "ok" : "skipped";
    try {
      await this.prisma.automationRun.create({
        data: {
          workspaceSlug: p.workspaceSlug,
          automationId,
          trigger,
          contactHandle: p.contactHandle,
          contactName: p.contactName || null,
          status,
          steps: trace.steps as unknown as object[],
          error,
          startedAt,
          finishedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`No se pudo guardar el historial de ${automationId}: ${(err as Error).message}`);
    }
  }

  /** Borra ejecuciones de más de 30 días (como mucho una vez por hora). */
  private lastPrune = 0;
  private async pruneRuns(now: Date): Promise<void> {
    if (now.getTime() - this.lastPrune < 3_600_000) return;
    this.lastPrune = now.getTime();
    try {
      await this.prisma.automationRun.deleteMany({
        where: { startedAt: { lt: new Date(now.getTime() - RUN_RETENTION_MS) } },
      });
    } catch (err) {
      this.logger.warn(`Limpieza del historial falló: ${(err as Error).message}`);
    }
  }

  /** Un auto-envío por chat cada 30 s (entre TODOS los flujos). */
  private cooldownOk(p: { workspaceSlug: string; contactHandle: string }): boolean {
    const key = `${p.workspaceSlug}|${p.contactHandle}`;
    const last = this.lastReply.get(key) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) return false;
    this.lastReply.set(key, Date.now());
    return true;
  }

  /** Envía por el canal del mensaje y lo deja registrado en el Inbox como salida. */
  private async deliver(
    p: { workspaceSlug: string; channel: string; contactHandle: string },
    text: string,
  ): Promise<boolean> {
    // Nunca se escribe a un contacto dado de baja (también al reanudar una espera).
    if (await this.consent.isHandleOptedOut(p.workspaceSlug, p.contactHandle)) {
      this.logger.log(`Envío omitido: ${p.contactHandle} está dado de baja (${p.workspaceSlug}).`);
      return false;
    }
    await this.providers.sendByChannel(p.workspaceSlug, p.channel, p.contactHandle, text);
    const conv = await this.prisma.conversation.findFirst({
      where: { workspaceSlug: p.workspaceSlug, contactHandle: p.contactHandle },
      select: { id: true },
    });
    if (conv) {
      await this.prisma.message
        .create({ data: { conversationId: conv.id, direction: "out", text } })
        .catch(() => undefined);
    }
    return true;
  }
}
