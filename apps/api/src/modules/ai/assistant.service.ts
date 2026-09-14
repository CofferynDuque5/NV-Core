import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { JobManager } from "../../core/jobs/job-manager.service";
import { ProviderManager } from "../../providers/provider-manager.service";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * "Asistente NV": the panel's conversational assistant, running ONLY on Gemini.
 *
 * It sees the whole workspace (a compact snapshot of every section is put in
 * the prompt on each turn) and can ACT through a small set of tools (Gemini
 * function calling): create contacts, draft/schedule/pause/resume/run
 * campaigns, schedule posts, resolve conversations, send a WhatsApp/Telegram
 * message, tag contacts. Anything destructive is deliberately not exposed.
 */

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TOOL_ROUNDS = 6;

/** Tool declarations in Gemini's function-calling format. */
const TOOLS = [
  {
    name: "crear_contacto",
    description: "Crea un contacto en el CRM del panel.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "Nombre del contacto" },
        phone: { type: "STRING", description: "Teléfono con código de país, ej. +584121234567" },
        email: { type: "STRING" },
        stage: { type: "STRING", description: "Etapa: Lead, Cliente, En riesgo o Inactivo" },
        tags: { type: "ARRAY", items: { type: "STRING" }, description: "Etiquetas, ej. netflix, disney+" },
      },
      required: ["name"],
    },
  },
  {
    name: "etiquetar_contacto",
    description: "Añade etiquetas y/o cambia la etapa de un contacto existente (por nombre o teléfono).",
    parameters: {
      type: "OBJECT",
      properties: {
        contacto: { type: "STRING", description: "Nombre o teléfono del contacto" },
        tags: { type: "ARRAY", items: { type: "STRING" } },
        stage: { type: "STRING" },
      },
      required: ["contacto"],
    },
  },
  {
    name: "crear_campana",
    description:
      "Crea una campaña de WhatsApp/Telegram. Queda en borrador salvo que se indique scheduleAt (ISO) y entonces queda programada. Se puede dirigir a grupos por nombre.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        message: { type: "STRING", description: "Texto del mensaje (puede usar {{grupo}})" },
        scheduleAt: { type: "STRING", description: "Fecha/hora ISO para programarla, opcional" },
        grupos: { type: "ARRAY", items: { type: "STRING" }, description: "Nombres (o parte) de los grupos destino" },
      },
      required: ["name", "message"],
    },
  },
  {
    name: "campana_accion",
    description: "Pausa, reanuda o envía ahora una campaña existente (por nombre o id).",
    parameters: {
      type: "OBJECT",
      properties: {
        campana: { type: "STRING", description: "Nombre o id de la campaña" },
        accion: { type: "STRING", description: "pausar | reanudar | enviar_ahora" },
      },
      required: ["campana", "accion"],
    },
  },
  {
    name: "programar_publicacion",
    description: "Programa una publicación en el calendario (canales: wa, tg, fb, ig, tk, x, th, email).",
    parameters: {
      type: "OBJECT",
      properties: {
        channel: { type: "STRING" },
        title: { type: "STRING" },
        copy: { type: "STRING" },
        scheduledAt: { type: "STRING", description: "Fecha/hora ISO" },
      },
      required: ["channel", "title", "scheduledAt"],
    },
  },
  {
    name: "enviar_mensaje",
    description: "Envía un mensaje directo por WhatsApp (o Telegram) a un número/contacto. Úsalo solo si el usuario lo pide explícitamente.",
    parameters: {
      type: "OBJECT",
      properties: {
        destinatario: { type: "STRING", description: "Teléfono con código de país o nombre de contacto" },
        texto: { type: "STRING" },
        canal: { type: "STRING", description: "wa (por defecto) o tg" },
      },
      required: ["destinatario", "texto"],
    },
  },
  {
    name: "resolver_conversacion",
    description: "Marca como resuelta (o reabre) una conversación del Inbox por nombre de contacto.",
    parameters: {
      type: "OBJECT",
      properties: {
        contacto: { type: "STRING" },
        resuelta: { type: "BOOLEAN", description: "true = resolver, false = reabrir" },
      },
      required: ["contacto"],
    },
  },
  {
    name: "buscar",
    description: "Busca en contactos, campañas, grupos, publicaciones, conversaciones y automatizaciones por texto.",
    parameters: {
      type: "OBJECT",
      properties: { q: { type: "STRING" } },
      required: ["q"],
    },
  },
];

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobManager,
    private readonly providers: ProviderManager,
  ) {}

  /** Compact, current picture of every section — the assistant's "eyes". */
  async snapshot(ws: string): Promise<string> {
    if (!this.prisma.enabled) return "Base de datos no disponible.";
    const p = this.prisma;
    const dayAgo = new Date(Date.now() - 24 * 3600_000);
    const [
      contactsCount,
      contacts,
      campaigns,
      groups,
      posts,
      conversations,
      automations,
      sentToday,
      failedToday,
      wa,
      tg,
      recentLogs,
    ] = await Promise.all([
      p.contact.count({ where: { workspaceSlug: ws } }),
      p.contact.findMany({ where: { workspaceSlug: ws }, orderBy: { createdAt: "desc" }, take: 25, select: { name: true, phone: true, stage: true, tags: true } }),
      p.campaign.findMany({ where: { workspaceSlug: ws }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, name: true, status: true, scheduleType: true, scheduleAt: true, scheduleTimes: true, lastRunAt: true, message: true, targets: { select: { group: { select: { name: true } } } } } }),
      p.group.findMany({ where: { workspaceSlug: ws }, orderBy: { members: "desc" }, take: 40, select: { name: true, channel: true, members: true, kind: true } }),
      p.post.findMany({ where: { workspaceSlug: ws, OR: [{ scheduledAt: { gte: dayAgo } }, { status: { in: ["scheduled", "publishing"] } }] }, orderBy: { scheduledAt: "asc" }, take: 20, select: { title: true, channel: true, status: true, scheduledAt: true } }),
      p.conversation.findMany({ where: { workspaceSlug: ws, resolved: false }, orderBy: { createdAt: "desc" }, take: 15, select: { contactName: true, channel: true, labels: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, direction: true } } } }),
      p.automation.findMany({ where: { workspaceSlug: ws }, select: { name: true, status: true, runs: true } }),
      p.sendLog.count({ where: { workspaceSlug: ws, ok: true, createdAt: { gte: dayAgo } } }),
      p.sendLog.count({ where: { workspaceSlug: ws, ok: false, createdAt: { gte: dayAgo } } }),
      p.whatsappSession.findUnique({ where: { workspaceSlug: ws }, select: { status: true, number: true, groupsCount: true } }),
      p.telegramSession.findUnique({ where: { workspaceSlug: ws }, select: { status: true, username: true, groupsCount: true } }),
      p.sendLog.findMany({ where: { workspaceSlug: ws, ok: false, createdAt: { gte: dayAgo } }, orderBy: { createdAt: "desc" }, take: 5, select: { groupName: true, error: true, campaignName: true } }),
    ]);
    const fmt = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("es-VE", { hour12: true }) : "—");
    const lines: string[] = [];
    lines.push(`FECHA/HORA ACTUAL: ${new Date().toLocaleString("es-VE", { hour12: true })}`);
    lines.push(`CONEXIONES: WhatsApp ${wa?.status ?? "desconectado"}${wa?.number ? ` (${wa.number}, ${wa.groupsCount} grupos)` : ""} · Telegram ${tg?.status ?? "desconectado"}${tg?.username ? ` (@${tg.username}, ${tg.groupsCount} grupos/canales)` : ""}`);
    lines.push(`HISTORIAL 24h: ${sentToday} envíos OK, ${failedToday} fallidos${recentLogs.length ? " · últimos fallos: " + recentLogs.map((l) => `${l.campaignName ?? ""}→${l.groupName ?? ""}: ${(l.error ?? "").slice(0, 60)}`).join(" | ") : ""}`);
    lines.push(`CAMPAÑAS (${campaigns.length}):`);
    for (const c of campaigns) {
      lines.push(`- [${c.id}] "${c.name}" · ${c.status} · ${c.scheduleType}${c.scheduleAt ? " " + c.scheduleAt : ""}${c.scheduleTimes?.length ? " " + c.scheduleTimes.join(",") : ""} · último envío ${fmt(c.lastRunAt)} · grupos: ${c.targets.map((t) => t.group?.name).filter(Boolean).slice(0, 6).join(", ") || "ninguno"} · texto: "${(c.message ?? "").slice(0, 60)}"`);
    }
    lines.push(`GRUPOS/CANALES (${groups.length}): ` + groups.map((g) => `${g.name} (${g.channel}${g.kind === "channel" ? " canal" : ""}, ${g.members})`).join("; "));
    lines.push(`CONTACTOS (${contactsCount} en total; últimos 25): ` + contacts.map((c) => `${c.name}${c.phone ? " " + c.phone : ""} [${c.stage}${c.tags.length ? " " + c.tags.join("/") : ""}]`).join("; "));
    lines.push(`PUBLICACIONES (calendario): ` + (posts.map((x) => `"${x.title}" ${x.channel} ${x.status} ${fmt(x.scheduledAt)}`).join("; ") || "ninguna próxima"));
    lines.push(`INBOX abiertas (${conversations.length}): ` + (conversations.map((c) => `${c.contactName} (${c.channel}${c.labels.length ? ", " + c.labels.join("/") : ""}): "${(c.messages[0]?.text ?? "").slice(0, 50)}"`).join("; ") || "ninguna"));
    lines.push(`AUTOMATIZACIONES: ` + (automations.map((a) => `${a.name} (${a.status}, ${a.runs} ejecuciones)`).join("; ") || "ninguna"));
    return lines.join("\n");
  }

  /** Run one assistant turn with tools; returns the final answer. */
  async chat(ws: string, apiKey: string, model: string, turns: AssistantTurn[]): Promise<string> {
    const snapshot = await this.snapshot(ws);
    const system =
      "Eres «Asistente NV», el asistente del panel NV Marketing de un negocio que vende cuentas de " +
      "streaming. Hablas en español, claro y breve. Tienes acceso a TODAS las secciones del panel: el " +
      "bloque ESTADO DEL PANEL de abajo es la información real y actual; úsala para responder con " +
      "datos concretos (números, nombres, fechas) y no inventes nada que no esté ahí. Cuando el usuario " +
      "te pida hacer algo (crear contacto, campaña, programar, pausar, enviar, resolver…), usa las " +
      "herramientas y confirma lo hecho con los datos devueltos. Si falta un dato imprescindible, " +
      "pregúntalo. Para acciones que envían mensajes a personas, hazlas solo si el usuario lo pidió " +
      "explícitamente.\n\n=== ESTADO DEL PANEL ===\n" +
      snapshot;

    const contents: any[] = turns.slice(-16).map((t) => ({
      role: t.role === "user" ? "user" : "model",
      parts: [{ text: t.content }],
    }));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(`${GEMINI}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools: [{ functionDeclarations: TOOLS }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gemini: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`);
      }
      const data = (await res.json()) as any;
      const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);
      if (calls.length === 0) {
        const text = parts.map((p) => p.text ?? "").join("").trim();
        return text || "No tengo respuesta para eso.";
      }
      // Execute every requested tool and feed the results back.
      contents.push({ role: "model", parts });
      const responses: any[] = [];
      for (const c of calls) {
        const name = String(c.functionCall.name);
        const args = (c.functionCall.args ?? {}) as Record<string, any>;
        let result: unknown;
        try {
          result = await this.execute(ws, name, args);
        } catch (err) {
          result = { error: (err as Error).message };
        }
        this.logger.log(`[${ws}] herramienta ${name}(${JSON.stringify(args).slice(0, 120)}) → ${JSON.stringify(result).slice(0, 120)}`);
        responses.push({ functionResponse: { name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    return "Hice varias acciones pero no pude cerrar la respuesta; revisa el panel.";
  }

  // ── Tools ──────────────────────────────────────────────────────────────────
  async execute(ws: string, name: string, a: Record<string, any>): Promise<unknown> {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    const p = this.prisma;
    switch (name) {
      case "crear_contacto": {
        const row = await p.contact.create({
          data: {
            workspaceSlug: ws,
            name: String(a.name).trim(),
            phone: a.phone ? String(a.phone).trim() : undefined,
            email: a.email ? String(a.email).trim() : undefined,
            stage: a.stage ? String(a.stage) : "Lead",
            tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
          },
        });
        return { ok: true, id: row.id, name: row.name };
      }
      case "etiquetar_contacto": {
        const c = await this.findContact(ws, String(a.contacto));
        if (!c) return { error: `No encontré el contacto "${a.contacto}".` };
        const tags = Array.from(new Set([...c.tags, ...(Array.isArray(a.tags) ? a.tags.map(String) : [])]));
        await p.contact.update({ where: { id: c.id }, data: { tags, ...(a.stage ? { stage: String(a.stage) } : {}) } });
        return { ok: true, name: c.name, tags, stage: a.stage ?? c.stage };
      }
      case "crear_campana": {
        const wanted: string[] = Array.isArray(a.grupos) ? a.grupos.map((g: unknown) => String(g).toLowerCase()) : [];
        const groups = wanted.length
          ? (await p.group.findMany({ where: { workspaceSlug: ws }, select: { id: true, name: true } })).filter((g) =>
              wanted.some((w) => g.name.toLowerCase().includes(w)),
            )
          : [];
        const scheduleAt = a.scheduleAt ? String(a.scheduleAt) : undefined;
        const row = await p.campaign.create({
          data: {
            workspaceSlug: ws,
            name: String(a.name).trim(),
            message: String(a.message),
            status: scheduleAt ? "programada" : "borrador",
            scheduleType: "once",
            scheduleAt,
            channels: ["wa"],
            targets: { create: groups.map((g) => ({ groupId: g.id })) },
          },
        });
        return { ok: true, id: row.id, name: row.name, status: row.status, grupos: groups.map((g) => g.name) };
      }
      case "campana_accion": {
        const c = await this.findCampaign(ws, String(a.campana));
        if (!c) return { error: `No encontré la campaña "${a.campana}".` };
        const accion = String(a.accion).toLowerCase();
        if (accion.startsWith("paus")) {
          await p.campaign.update({ where: { id: c.id }, data: { status: "pausada" } });
          return { ok: true, name: c.name, status: "pausada" };
        }
        if (accion.startsWith("rean") || accion.startsWith("activ")) {
          await p.campaign.update({ where: { id: c.id }, data: { status: "programada" } });
          return { ok: true, name: c.name, status: "programada" };
        }
        if (accion.includes("enviar") || accion.includes("ejecut")) {
          await this.jobs.dispatch("campaign.run", ws, { workspaceSlug: ws, campaignId: c.id });
          return { ok: true, name: c.name, nota: "Envío iniciado; los resultados aparecen en Historial." };
        }
        return { error: `Acción desconocida: ${a.accion}` };
      }
      case "programar_publicacion": {
        const channel = String(a.channel || "wa").toLowerCase();
        const row = await p.post.create({
          data: {
            workspaceSlug: ws,
            channel: channel as any,
            title: String(a.title),
            copy: a.copy ? String(a.copy) : undefined,
            status: "scheduled",
            scheduledAt: new Date(String(a.scheduledAt)),
          },
        });
        return { ok: true, id: row.id, title: row.title, channel, scheduledAt: row.scheduledAt };
      }
      case "enviar_mensaje": {
        const canal = String(a.canal || "wa");
        let to = String(a.destinatario).trim();
        if (!/^\+?\d{6,}$/.test(to.replace(/[\s-]/g, ""))) {
          const c = await this.findContact(ws, to);
          if (!c?.phone) return { error: `No encontré un teléfono para "${a.destinatario}".` };
          to = c.phone;
        }
        const r = await this.providers.sendByChannel(ws, canal, to, String(a.texto));
        return { ok: true, id: r.id, to };
      }
      case "resolver_conversacion": {
        const conv = await p.conversation.findFirst({
          where: { workspaceSlug: ws, contactName: { contains: String(a.contacto), mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
        });
        if (!conv) return { error: `No encontré una conversación con "${a.contacto}".` };
        const resolved = a.resuelta === undefined ? true : Boolean(a.resuelta);
        await p.conversation.update({ where: { id: conv.id }, data: { resolved } });
        return { ok: true, contacto: conv.contactName, resuelta: resolved };
      }
      case "buscar": {
        const q = String(a.q);
        const like = { contains: q, mode: "insensitive" as const };
        const [contacts, campaigns, groups, posts, convs, autos] = await Promise.all([
          p.contact.findMany({ where: { workspaceSlug: ws, OR: [{ name: like }, { phone: like }, { email: like }] }, take: 10, select: { name: true, phone: true, stage: true, tags: true } }),
          p.campaign.findMany({ where: { workspaceSlug: ws, OR: [{ name: like }, { message: like }] }, take: 10, select: { id: true, name: true, status: true, lastRunAt: true } }),
          p.group.findMany({ where: { workspaceSlug: ws, name: like }, take: 10, select: { name: true, channel: true, members: true } }),
          p.post.findMany({ where: { workspaceSlug: ws, OR: [{ title: like }, { copy: like }] }, take: 10, select: { title: true, channel: true, status: true, scheduledAt: true } }),
          p.conversation.findMany({ where: { workspaceSlug: ws, contactName: like }, take: 10, select: { contactName: true, channel: true, resolved: true } }),
          p.automation.findMany({ where: { workspaceSlug: ws, name: like }, take: 10, select: { name: true, status: true } }),
        ]);
        return { contacts, campaigns, groups, posts, conversations: convs, automations: autos };
      }
      default:
        return { error: `Herramienta desconocida: ${name}` };
    }
  }

  private async findContact(ws: string, q: string) {
    const like = { contains: q, mode: "insensitive" as const };
    return this.prisma.contact.findFirst({ where: { workspaceSlug: ws, OR: [{ name: like }, { phone: like }] } });
  }

  private async findCampaign(ws: string, q: string) {
    return (
      (await this.prisma.campaign.findFirst({ where: { workspaceSlug: ws, id: q } })) ??
      (await this.prisma.campaign.findFirst({ where: { workspaceSlug: ws, name: { contains: q, mode: "insensitive" } }, orderBy: { createdAt: "desc" } }))
    );
  }
}
