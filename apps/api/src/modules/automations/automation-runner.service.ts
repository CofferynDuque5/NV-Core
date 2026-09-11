import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { AutomationEdge, AutomationNode } from "@nv/domain";

import { EventBus } from "../../core/events/event-bus.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ProviderManager } from "../../providers/provider-manager.service";
import { AiService } from "../ai/ai.module";
import { NotificationsService } from "../notifications/notifications.module";

/**
 * Ejecuta las automatizaciones DE VERDAD (no solo dry-run): al llegar un mensaje
 * (WhatsApp/Telegram) recorre cada flujo activo del workspace cuyo disparador
 * sea "mensaje entrante" y ejecuta sus acciones: respuesta con IA, mensaje fijo,
 * crear contacto, notificar y escalar a humano. Las condiciones se evalúan
 * contra el contexto del mensaje (intención, resuelto, canal…).
 *
 * Seguros anti-spam: nunca responde a mensajes propios, una sola respuesta por
 * chat cada 30 s (aunque haya varios flujos), y el "wait" se ignora en modo
 * reactivo (no encola envíos futuros a ciegas).
 */
const COOLDOWN_MS = 30_000;
const str = (v: unknown): string => (v == null ? "" : String(v));
const cfg = (n: AutomationNode): Record<string, unknown> => n.config ?? {};

/** Palabras que marcan intención de compra / soporte (heurística barata). */
const BUY_WORDS = ["precio", "cuanto", "cuánto", "quiero", "comprar", "compra", "cuenta", "combo", "pago", "pagar", "vale"];
const HELP_WORDS = ["no funciona", "ayuda", "error", "no me deja", "no puedo", "problema", "pantalla en uso", "pin"];

@Injectable()
export class AutomationRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationRunnerService.name);
  private unsubscribe: (() => void) | null = null;
  /** Último auto-envío por (workspace|handle) para el cooldown anti-spam. */
  private readonly lastReply = new Map<string, number>();

  constructor(
    private readonly events: EventBus,
    private readonly prisma: PrismaService,
    private readonly providers: ProviderManager,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.on("message.received", (p) => this.onMessage(p));
    this.logger.log("Runner de automatizaciones activo (mensaje entrante → flujos).");
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  private async onMessage(p: {
    workspaceSlug: string;
    channel: string;
    contactHandle: string;
    contactName: string;
    text: string;
  }): Promise<void> {
    if (!this.prisma.enabled || !p.text?.trim()) return;
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
      try {
        const ran = await this.walk(flow.id, p, nodes, edges, trigger.id, { ...context });
        if (ran) {
          await this.prisma.automation
            .update({ where: { id: flow.id }, data: { runs: { increment: 1 } } })
            .catch(() => undefined);
        }
      } catch (err) {
        this.logger.warn(`Flujo "${flow.name}" falló: ${(err as Error).message}`);
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

  /** Recorre el grafo desde el trigger ejecutando acciones; devuelve si hizo algo. */
  private async walk(
    flowId: string,
    p: { workspaceSlug: string; channel: string; contactHandle: string; contactName: string; text: string },
    nodes: AutomationNode[],
    edges: AutomationEdge[],
    startId: string,
    context: Record<string, string>,
  ): Promise<boolean> {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    let current: AutomationNode | undefined = byId.get(startId);
    let didSomething = false;

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      let branch: "true" | "false" | undefined;

      if (current.type === "action") {
        didSomething = (await this.runAction(flowId, current, p, context)) || didSomething;
      } else if (current.type === "cond") {
        branch = this.evalCond(current, context) ? "true" : "false";
      } else if (current.type === "wait") {
        // Reactivo: no encolamos envíos futuros a ciegas (evita spam diferido).
        this.logger.debug?.(`Nodo de espera omitido en modo reactivo (${current.label}).`);
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
    p: { workspaceSlug: string; channel: string; contactHandle: string; contactName: string; text: string },
    ctx: Record<string, string>,
  ): Promise<boolean> {
    const c = cfg(node);
    const kind = (str(c.kind) || str(c.action)).replace(/-/g, "_");
    switch (kind) {
      case "ai_reply": {
        if (!this.cooldownOk(p)) return false;
        const { reply } = await this.ai.chat(p.workspaceSlug, {
          system: str(c.prompt) || undefined,
          messages: [{ role: "user", content: p.text }],
        });
        if (!reply) return false;
        await this.deliver(p, reply);
        // Si el cliente pidió ayuda y la IA no derivó, lo damos por resuelto.
        const low = reply.toLowerCase();
        ctx.resolved = /persona|humano|asesor|te paso con/.test(low) ? "false" : "true";
        return true;
      }
      case "send_message": {
        if (!this.cooldownOk(p)) return false;
        const body = str(c.body).replace(/\{\{\s*nombre\s*\}\}/gi, p.contactName || "");
        if (!body.trim()) return false;
        await this.deliver(p, body);
        return true;
      }
      case "create_contact": {
        const exists = await this.prisma.contact.findFirst({
          where: { workspaceSlug: p.workspaceSlug, phone: { contains: p.contactHandle.replace(/\D/g, "").slice(-9) } },
          select: { id: true },
        });
        if (exists) return false;
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
        return true;
      }
      case "notify": {
        await this.notifications.create(p.workspaceSlug, {
          type: "info",
          title: str(c.title) || `Interesado: ${p.contactName || p.contactHandle}`,
          meta: p.text.slice(0, 140),
        });
        return true;
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
        return true;
      }
      default:
        this.logger.debug?.(`Acción desconocida "${kind}" en flujo ${flowId}; se omite.`);
        return false;
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
  ): Promise<void> {
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
  }
}
