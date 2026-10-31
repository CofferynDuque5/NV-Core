import * as fs from "node:fs";
import * as path from "node:path";
import * as tls from "node:tls";

import { BadRequestException, Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { analyzeGroupRules } from "@nv/domain";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { EventBus } from "../../core/events/event-bus.service";
import { NotificationsService } from "../notifications/notifications.module";
import { BaileysSession } from "./baileys.session";
import { SessionManager } from "./session-manager";
import { WhatsappGateway } from "./whatsapp.gateway";
import {
  loadBaileys,
  type SessionAlert,
  type SessionChatMessage,
  type SessionEvents,
  type WhatsappAttachment,
  type WhatsappGroup,
  type WhatsappStatus,
  type WhatsappStatusValue,
} from "./whatsapp.types";

/** How often the watchdog re-checks dropped sessions (ms). */
const WATCHDOG_INTERVAL_MS = 3 * 60_000;

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`sin respuesta en ${ms / 1000}s`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** Opens and closes a TLS socket — proves outbound 443 is allowed by the host. */
function tlsProbe(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port, servername: host }, () => {
      s.end();
      resolve();
    });
    s.on("error", reject);
  });
}

/**
 * Group fields read from a WhatsApp sync: what WhatsApp says now (description,
 * creator, admins-only) and the requirements its rules ask for, only when
 * found (so a manual «exige precio» is never switched off by a sync).
 */
export function groupRulesFromSync(g: WhatsappGroup) {
  const description = g.description?.trim() || null;
  const a = analyzeGroupRules(description, g.onlyAdmins === true);
  const whenFound: { forbidsAds?: true; requiresPrice?: true; requiresImage?: true } = {};
  if (a.forbidsAds) whenFound.forbidsAds = true;
  if (a.requiresPrice) whenFound.requiresPrice = true;
  if (a.requiresImage) whenFound.requiresImage = true;
  return {
    always: {
      ...(g.description !== undefined ? { description } : {}),
      ...(g.ownerJid !== undefined ? { ownerJid: g.ownerJid } : {}),
      onlyAdmins: g.onlyAdmins === true,
      rulesCheckedAt: new Date(),
    },
    whenFound,
    analysis: a,
  };
}

/** Most WhatsApp numbers one brand can link at once. */
export const MAX_WA_LINES = 5;

/**
 * Session key of a brand's WhatsApp number: line 1 keeps the brand slug (so
 * existing sessions keep working), other lines are «<slug>__n<line>».
 */
export function waLineKey(workspaceSlug: string, line = 1): string {
  return line > 1 ? `${workspaceSlug}__n${line}` : workspaceSlug;
}

export function parseWaLineKey(key: string): { workspaceSlug: string; line: number } {
  const m = /^(.+)__n(\d+)$/.exec(key);
  return m ? { workspaceSlug: m[1]!, line: Number(m[2]) } : { workspaceSlug: key, line: 1 };
}

const NOT_CONNECTED = "WhatsApp (Baileys) no está conectado en este workspace.";

@Injectable()
export class WhatsappService implements SessionEvents, OnModuleInit, OnModuleDestroy {
  private readonly sessions: SessionManager;
  private readonly live = new Map<string, BaileysSession>();
  // Último QR (data URL) por workspace, para exponerlo también por HTTP (status).
  // En cPanel/LiteSpeed los WebSockets no funcionan, así que el panel obtiene el
  // QR haciendo polling a /whatsapp/status en vez de depender del socket.
  private readonly qrs = new Map<string, string>();
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly gateway: WhatsappGateway,
    private readonly events: EventBus,
    private readonly notifications: NotificationsService,
  ) {
    this.sessions = new SessionManager(
      config.get("integrations", { infer: true }).whatsappSessionDir,
    );
  }

  /** On boot, resume any workspace that still has stored credentials. */
  async onModuleInit(): Promise<void> {
    for (const slug of this.sessions.listSessions()) {
      void this.getOrCreate(slug).start();
    }
    // Vigilante: en un hosting el proceso se reinicia o el socket cae tras un
    // rato inactivo. Cada pocos minutos re-levantamos las sesiones caídas que
    // aún tienen credenciales guardadas, así WhatsApp se mantiene conectado sin
    // que el usuario tenga que volver a escanear el QR.
    this.watchdog = setInterval(() => this.sweep(), WATCHDOG_INTERVAL_MS);
    this.watchdog.unref?.();
  }

  onModuleDestroy(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  /** Re-launch any stored session that dropped and is safe to resume. */
  private sweep(): void {
    for (const slug of this.sessions.listSessions()) {
      this.getOrCreate(slug).ensureAlive();
    }
  }

  private getOrCreate(key: string): BaileysSession {
    let session = this.live.get(key);
    if (!session) {
      session = new BaileysSession(key, this.sessions, this);
      this.live.set(key, session);
    }
    return session;
  }

  /** Line numbers a brand has: stored rows plus sessions on disk (line 1 always). */
  private async lineNumbers(workspaceSlug: string): Promise<number[]> {
    const found = new Set<number>([1]);
    for (const key of this.sessions.listSessions()) {
      const p = parseWaLineKey(key);
      if (p.workspaceSlug === workspaceSlug) found.add(p.line);
    }
    if (this.prisma.enabled) {
      const rows = await this.prisma.whatsappSession.findMany({ where: { workspaceSlug }, select: { line: true } });
      for (const r of rows) found.add(r.line);
    }
    return [...found].sort((a, b) => a - b);
  }

  private lineConnected(workspaceSlug: string, line: number): boolean {
    return this.live.get(waLineKey(workspaceSlug, line))?.isConnected ?? false;
  }

  /** Connected lines of a brand, main number first. */
  private connectedLines(workspaceSlug: string): BaileysSession[] {
    const out: { line: number; s: BaileysSession }[] = [];
    for (const [key, s] of this.live) {
      const p = parseWaLineKey(key);
      if (p.workspaceSlug === workspaceSlug && s.isConnected) out.push({ line: p.line, s });
    }
    return out.sort((a, b) => a.line - b.line).map((x) => x.s);
  }

  /**
   * The number a message goes out from: the one in the group (groups), the one
   * the contact wrote to (chats), otherwise the main connected number.
   */
  private async sessionFor(workspaceSlug: string, to?: string): Promise<BaileysSession> {
    let preferred: number | null = null;
    if (to && this.prisma.enabled) {
      if (to.endsWith("@g.us")) {
        const g = await this.prisma.group.findFirst({
          where: { workspaceSlug, channel: "wa", remoteJid: to },
          select: { waLine: true },
        });
        preferred = g?.waLine ?? null;
      } else {
        const c = await this.prisma.conversation.findFirst({
          where: { workspaceSlug, channel: "wa", contactHandle: to },
          select: { waLine: true },
        });
        preferred = c?.waLine ?? null;
      }
    }
    if (preferred && this.lineConnected(workspaceSlug, preferred)) {
      return this.live.get(waLineKey(workspaceSlug, preferred))!;
    }
    const any = this.connectedLines(workspaceSlug)[0];
    if (!any) throw new Error(NOT_CONNECTED);
    return any;
  }

  // ── SessionEvents (called by BaileysSession with its session key) ─────────
  onQr(key: string, dataUrl: string): void {
    this.qrs.set(key, dataUrl); // disponible por HTTP (status)
    this.sessions.saveQr(key, dataUrl); // …también desde otros procesos
    const { workspaceSlug, line } = parseWaLineKey(key);
    if (line === 1) this.gateway.emitQr(workspaceSlug, dataUrl);
  }

  onStatus(key: string, status: WhatsappStatusValue): void {
    if (status === "connected" || status === "disconnected") {
      this.qrs.delete(key);
      this.sessions.clearQr(key);
    }
    void this.persist(key, { status }).then(() => this.emit(key));
  }

  onMeta(
    key: string,
    meta: {
      number?: string | null;
      groupsCount?: number;
      contactsCount?: number;
      connectedAt?: Date;
    },
  ): void {
    void this.persist(key, {
      number: meta.number ?? undefined,
      groupsCount: meta.groupsCount,
      contactsCount: meta.contactsCount,
      lastConnectionAt: meta.connectedAt,
    }).then(() => this.emit(key));
  }

  /** Persist the synced groups so campaigns can target them. */
  onGroups(key: string, groups: WhatsappGroup[]): void {
    void this.persistGroups(key, groups);
  }

  /** A direct chat message → publish for the Inbox to persist (decoupled). */
  onInbound(key: string, msg: SessionChatMessage): void {
    const { workspaceSlug, line } = parseWaLineKey(key);
    this.events.emit("session.inbound", { workspaceSlug, channel: "wa", ...msg, waLine: line });
  }

  /** Contact names from WhatsApp → the Inbox replaces bare numbers with them. */
  onContactNames(key: string, names: { handle: string; name: string }[]): void {
    this.events.emit("session.contact-names", { workspaceSlug: parseWaLineKey(key).workspaceSlug, channel: "wa", names });
  }

  /** A connection problem → persist a notification and push the live status. */
  onAlert(key: string, alert: SessionAlert): void {
    const { workspaceSlug, line } = parseWaLineKey(key);
    void this.notifications.create(workspaceSlug, {
      type: alert.level === "error" ? "error" : "warning",
      title: `WhatsApp${line > 1 ? ` (número ${line})` : ""}: ${alert.reason}`,
      meta: "whatsapp",
    });
    void this.emit(key);
  }

  private async persistGroups(key: string, groups: WhatsappGroup[]): Promise<void> {
    // Never prune on an empty fetch (a transient sync error would wipe everything);
    // the early return keeps the last known list until a real sync arrives.
    if (!this.prisma.enabled || !groups.length) return;
    const { workspaceSlug, line } = parseWaLineKey(key);
    const jids = groups.map((g) => g.remoteJid);
    // A group both numbers are in stays with the number that already sends to
    // it while that number is connected.
    const known = await this.prisma.group.findMany({
      where: { workspaceSlug, remoteJid: { in: jids } },
      select: { remoteJid: true, waLine: true },
    });
    const ownerLine = new Map(known.map((g) => [g.remoteJid, g.waLine]));
    for (const g of groups) {
      // The description is where groups write their rules: read it on every
      // sync. A detected requirement is switched on, never off, so a choice
      // the user made by hand is kept.
      const rules = groupRulesFromSync(g);
      const current = ownerLine.get(g.remoteJid);
      const waLine = current && current !== line && this.lineConnected(workspaceSlug, current) ? current : line;
      await this.prisma.group.upsert({
        where: { workspaceSlug_remoteJid: { workspaceSlug, remoteJid: g.remoteJid } },
        create: {
          workspaceSlug,
          remoteJid: g.remoteJid,
          name: g.subject,
          members: g.size,
          channel: "wa",
          synced: true,
          waLine,
          ...rules.always,
          ...rules.whenFound,
        },
        update: { name: g.subject, members: g.size, synced: true, waLine, ...rules.always, ...rules.whenFound },
      });
    }
    // Prune auto-imported WhatsApp groups this number is no longer in — e.g. after
    // linking a DIFFERENT WhatsApp, so campaigns stop targeting the old account's
    // groups. Manually created groups (synced=false) and other numbers' groups are kept.
    await this.prisma.group.deleteMany({
      where: { workspaceSlug, channel: "wa", synced: true, waLine: line, remoteJid: { notIn: jids } },
    });
  }

  private async persist(
    key: string,
    data: {
      status?: WhatsappStatusValue;
      number?: string;
      groupsCount?: number;
      contactsCount?: number;
      lastConnectionAt?: Date;
      label?: string | null;
    },
  ): Promise<void> {
    if (!this.prisma.enabled) return;
    const { workspaceSlug, line } = parseWaLineKey(key);
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await this.prisma.whatsappSession.upsert({
      where: { workspaceSlug_line: { workspaceSlug, line } },
      create: { workspaceSlug, line, ...clean },
      update: clean,
    });
  }

  private async emit(key: string): Promise<void> {
    // The live socket only carries the main number; the others are polled.
    const { workspaceSlug, line } = parseWaLineKey(key);
    if (line === 1) this.gateway.emitStatus(workspaceSlug, await this.status(workspaceSlug));
  }

  // ── Public API (controller + provider manager) ────────────────────────────
  async status(workspaceSlug: string, line = 1): Promise<WhatsappStatus> {
    const key = waLineKey(workspaceSlug, line);
    const row = this.prisma.enabled
      ? await this.prisma.whatsappSession.findUnique({ where: { workspaceSlug_line: { workspaceSlug, line } } })
      : null;
    const session = this.live.get(key);
    const owner = this.sessions.lockOwner(key);
    // Fuente de verdad del estado:
    //  - si ESTE proceso corre el socket → su estado en memoria;
    //  - si lo corre OTRO proceso vivo (hosting con varias copias de la app) →
    //    el estado que ese proceso persistió en la base de datos;
    //  - si nadie lo corre (proceso reiniciado por el hosting) → "disconnected",
    //    aunque la fila de la BD se quedara en "connected".
    const runsHere = Boolean(session?.active || (owner?.fresh && owner.mine));
    const runsElsewhere = Boolean(owner?.fresh && !owner.mine);
    const statusValue: WhatsappStatusValue = runsHere
      ? session!.currentStatus
      : runsElsewhere
        ? ((row?.status as WhatsappStatusValue) ?? "disconnected")
        : "disconnected";
    return {
      status: statusValue,
      provider: "baileys",
      line,
      label: row?.label ?? null,
      number: row?.number ?? null,
      lastConnectionAt: row?.lastConnectionAt?.toISOString() ?? null,
      groupsCount: row?.groupsCount ?? 0,
      contactsCount: row?.contactsCount ?? 0,
      error: session?.lastError ?? null,
      // El QR viaja también por HTTP para que el panel lo muestre aunque no haya
      // WebSocket (cPanel/LiteSpeed). Solo cuando el estado es "qr". Si el QR lo
      // generó otro proceso, se lee del archivo compartido.
      qr: statusValue === "qr" ? (this.qrs.get(key) ?? this.sessions.readQr(key)) : null,
      diagnostics: {
        pid: process.pid,
        node: process.version,
        sessionDir: this.sessions.baseDir,
        hasCreds: this.sessions.hasSession(key),
        owner: owner ? { pid: owner.pid, fresh: owner.fresh, mine: owner.mine } : null,
        events: this.sessions.readEvents(key, 25),
      },
    };
  }

  /** Every WhatsApp number of the brand (main first). */
  async lines(workspaceSlug: string): Promise<WhatsappStatus[]> {
    const numbers = await this.lineNumbers(workspaceSlug);
    return Promise.all(numbers.map((n) => this.status(workspaceSlug, n)));
  }

  /** Link one more number: opens a new session that shows its own QR. */
  async addLine(workspaceSlug: string, label?: string | null): Promise<WhatsappStatus> {
    const numbers = await this.lineNumbers(workspaceSlug);
    if (numbers.length >= MAX_WA_LINES) {
      throw new BadRequestException(`Puedes conectar hasta ${MAX_WA_LINES} números de WhatsApp por marca.`);
    }
    const line = Math.max(...numbers) + 1;
    await this.persist(waLineKey(workspaceSlug, line), { status: "disconnected", label: label?.trim() || null });
    return this.connect(workspaceSlug, line);
  }

  async renameLine(workspaceSlug: string, line: number, label: string | null): Promise<WhatsappStatus> {
    await this.persist(waLineKey(workspaceSlug, line), { label: label?.trim() || null });
    return this.status(workspaceSlug, line);
  }

  /**
   * Unlink an extra number: closes it, forgets its pairing and its groups.
   * Its chats stay in the Inbox and are answered from the main number.
   */
  async removeLine(workspaceSlug: string, line: number): Promise<void> {
    if (line <= 1) throw new BadRequestException("El número principal se desconecta, no se elimina.");
    const key = waLineKey(workspaceSlug, line);
    await this.live.get(key)?.logout();
    this.live.delete(key);
    this.sessions.deleteSession(key);
    this.qrs.delete(key);
    if (!this.prisma.enabled) return;
    await this.prisma.group.deleteMany({ where: { workspaceSlug, channel: "wa", synced: true, waLine: line } });
    await this.prisma.conversation.updateMany({ where: { workspaceSlug, waLine: line }, data: { waLine: null } });
    await this.prisma.whatsappSession.deleteMany({ where: { workspaceSlug, line } });
  }

  async diagnose(workspaceSlug: string, line = 1): Promise<{ lines: string[] }> {
    const key = waLineKey(workspaceSlug, line);
    const lines: string[] = [];
    const ok = (s: string) => lines.push(`✔ ${s}`);
    const bad = (s: string) => lines.push(`✖ ${s}`);
    lines.push(`Proceso pid ${process.pid} · Node ${process.version} · ${process.platform}/${process.arch}`);
    lines.push(`Directorio de sesión: ${this.sessions.baseDir}`);

    try {
      const probe = path.join(this.sessions.dirFor(key), `.write-test-${process.pid}`);
      fs.writeFileSync(probe, "ok");
      fs.rmSync(probe, { force: true });
      ok("El directorio de sesión se puede escribir.");
    } catch (e) {
      bad(`No se puede escribir el directorio de sesión: ${(e as Error).message}`);
    }

    lines.push(
      this.sessions.hasSession(key)
        ? "Hay credenciales guardadas (intentará reanudar; si están muertas pedirá QR nuevo)."
        : "Sin credenciales guardadas (pedirá QR)."
    );
    const owner = this.sessions.lockOwner(key);
    lines.push(
      owner
        ? `Dueño del socket: pid ${owner.pid} (${owner.fresh ? "vivo" : "caído"}${owner.mine ? ", este proceso" : ""}).`
        : "Nadie tiene el socket ahora mismo.",
    );
    const live = this.live.get(key);
    if (live) lines.push(`Estado en este proceso: ${live.currentStatus}${live.lastError ? ` · ${live.lastError}` : ""}`);

    let baileys: Record<string, unknown> | null = null;
    try {
      baileys = await loadBaileys();
      ok("Baileys se carga correctamente.");
    } catch (e) {
      bad(`Baileys NO se carga: ${(e as Error).message}`);
    }

    try {
      const fetchVersion = baileys?.fetchLatestBaileysVersion as (() => Promise<{ version?: number[] }>) | undefined;
      const res = fetchVersion ? await withDeadline(fetchVersion(), 6_000) : undefined;
      if (res?.version) ok(`Versión de WhatsApp Web obtenida: ${res.version.join(".")}`);
      else lines.push("Versión de WhatsApp Web: no disponible (se usa la incluida).");
    } catch (e) {
      lines.push(`Versión de WhatsApp Web: no se pudo consultar (${(e as Error).message}); se usa la incluida.`);
    }

    try {
      await withDeadline(tlsProbe("web.whatsapp.com", 443), 6_000);
      ok("Conexión TLS a web.whatsapp.com:443 correcta (el hosting deja salir).");
    } catch (e) {
      bad(`No se llega a web.whatsapp.com:443: ${(e as Error).message} — el hosting bloquea la salida; WhatsApp no puede conectar desde este servidor.`);
    }

    this.sessions.appendEvent(key, `Diagnóstico ejecutado: ${lines.filter((l) => l.startsWith("✖")).length} problema(s).`);
    return { lines };
  }

  async connect(workspaceSlug: string, line = 1): Promise<WhatsappStatus> {
    await this.getOrCreate(waLineKey(workspaceSlug, line)).start({ userInitiated: true });
    return this.status(workspaceSlug, line);
  }

  async reconnect(workspaceSlug: string, line = 1): Promise<WhatsappStatus> {
    return this.connect(workspaceSlug, line);
  }

  /** "QR nuevo": forget the stored pairing and start a fresh QR pairing right away. */
  async relink(workspaceSlug: string, line = 1): Promise<WhatsappStatus> {
    const key = waLineKey(workspaceSlug, line);
    this.sessions.appendEvent(key, "«QR nuevo» pulsado: se borran las credenciales y se vuelve a vincular.");
    await this.live.get(key)?.logout();
    this.live.delete(key);
    this.sessions.deleteSession(key);
    await this.persist(key, { status: "disconnected", groupsCount: 0, contactsCount: 0 });
    return this.connect(workspaceSlug, line);
  }

  async disconnect(workspaceSlug: string, line = 1): Promise<WhatsappStatus> {
    const key = waLineKey(workspaceSlug, line);
    await this.live.get(key)?.logout();
    this.live.delete(key);
    await this.persist(key, {
      status: "disconnected",
      number: undefined,
      groupsCount: 0,
      contactsCount: 0,
    });
    return this.status(workspaceSlug, line);
  }

  /** Re-read groups and contacts: one number, or all of the brand's. */
  async sync(workspaceSlug: string, line?: number): Promise<WhatsappStatus> {
    if (line) await this.live.get(waLineKey(workspaceSlug, line))?.sync();
    else for (const s of this.connectedLines(workspaceSlug)) await s.sync();
    return this.status(workspaceSlug, line ?? 1);
  }

  /** True when any of the brand's numbers is connected. */
  isConnected(workspaceSlug: string): boolean {
    return this.connectedLines(workspaceSlug).length > 0;
  }

  async sendText(workspaceSlug: string, to: string, text: string): Promise<{ id: string }> {
    return (await this.sessionFor(workspaceSlug, to)).sendText(to, text);
  }

  /** List the WhatsApp groups synced for a workspace (most members first). */
  async listGroups(workspaceSlug: string) {
    if (!this.prisma.enabled) return [];
    return this.prisma.group.findMany({
      where: { workspaceSlug, channel: "wa", synced: true },
      orderBy: { members: "desc" },
    });
  }

  /** Send a message (optionally with media) to a group by its JID, from the number that is in it. */
  async sendToGroup(
    workspaceSlug: string,
    remoteJid: string,
    text: string,
    attachment?: WhatsappAttachment | null,
  ): Promise<{ id: string }> {
    return (await this.sessionFor(workspaceSlug, remoteJid)).sendToGroup(remoteJid, text, attachment);
  }

  /** Send media (or text) to any target — group JID, full JID, or phone number. */
  async sendMedia(
    workspaceSlug: string,
    to: string,
    text: string,
    attachment?: WhatsappAttachment | null,
  ): Promise<{ id: string }> {
    return (await this.sessionFor(workspaceSlug, to)).sendMedia(to, text, attachment);
  }

  /** Publish to the account's WhatsApp Status (Estados), from the main connected number. */
  async postStatus(
    workspaceSlug: string,
    text: string,
    attachment?: WhatsappAttachment | null,
  ): Promise<{ id: string }> {
    return (await this.sessionFor(workspaceSlug)).postStatus(text, attachment);
  }
}
