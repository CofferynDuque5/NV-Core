import * as fs from "node:fs";
import * as path from "node:path";
import * as tls from "node:tls";

import { Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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

  private getOrCreate(workspaceSlug: string): BaileysSession {
    let session = this.live.get(workspaceSlug);
    if (!session) {
      session = new BaileysSession(workspaceSlug, this.sessions, this);
      this.live.set(workspaceSlug, session);
    }
    return session;
  }

  // ── SessionEvents (called by BaileysSession) ──────────────────────────────
  onQr(workspaceSlug: string, dataUrl: string): void {
    this.qrs.set(workspaceSlug, dataUrl); // disponible por HTTP (status)
    this.sessions.saveQr(workspaceSlug, dataUrl); // …también desde otros procesos
    this.gateway.emitQr(workspaceSlug, dataUrl);
  }

  onStatus(workspaceSlug: string, status: WhatsappStatusValue): void {
    // Al conectar o desconectar, el QR ya no sirve: se descarta.
    if (status === "connected" || status === "disconnected") {
      this.qrs.delete(workspaceSlug);
      this.sessions.clearQr(workspaceSlug);
    }
    void this.persist(workspaceSlug, { status }).then(() => this.emit(workspaceSlug));
  }

  onMeta(
    workspaceSlug: string,
    meta: {
      number?: string | null;
      groupsCount?: number;
      contactsCount?: number;
      connectedAt?: Date;
    },
  ): void {
    void this.persist(workspaceSlug, {
      number: meta.number ?? undefined,
      groupsCount: meta.groupsCount,
      contactsCount: meta.contactsCount,
      lastConnectionAt: meta.connectedAt,
    }).then(() => this.emit(workspaceSlug));
  }

  /** Persist the synced groups so campaigns can target them. */
  onGroups(workspaceSlug: string, groups: WhatsappGroup[]): void {
    void this.persistGroups(workspaceSlug, groups);
  }

  /** A direct inbound message → publish for the Inbox to persist (decoupled). */
  onInbound(
    workspaceSlug: string,
    msg: { contactHandle: string; contactName: string; text: string },
  ): void {
    this.events.emit("session.inbound", { workspaceSlug, channel: "wa", ...msg });
  }

  /** A connection problem → persist a notification and push the live status. */
  onAlert(workspaceSlug: string, alert: SessionAlert): void {
    void this.notifications.create(workspaceSlug, {
      type: alert.level === "error" ? "error" : "warning",
      title: `WhatsApp: ${alert.reason}`,
      meta: "whatsapp",
    });
    void this.emit(workspaceSlug);
  }

  private async persistGroups(workspaceSlug: string, groups: WhatsappGroup[]): Promise<void> {
    // Never prune on an empty fetch (a transient sync error would wipe everything);
    // the early return keeps the last known list until a real sync arrives.
    if (!this.prisma.enabled || !groups.length) return;
    const jids = groups.map((g) => g.remoteJid);
    for (const g of groups) {
      await this.prisma.group.upsert({
        where: { workspaceSlug_remoteJid: { workspaceSlug, remoteJid: g.remoteJid } },
        create: {
          workspaceSlug,
          remoteJid: g.remoteJid,
          name: g.subject,
          members: g.size,
          channel: "wa",
          synced: true,
        },
        update: { name: g.subject, members: g.size, synced: true },
      });
    }
    // Prune auto-imported WhatsApp groups this account is no longer in — e.g. after
    // linking a DIFFERENT WhatsApp, so campaigns stop targeting the old account's
    // groups. Manually created groups (synced=false) are always kept.
    await this.prisma.group.deleteMany({
      where: { workspaceSlug, channel: "wa", synced: true, remoteJid: { notIn: jids } },
    });
  }

  private async persist(
    workspaceSlug: string,
    data: {
      status?: WhatsappStatusValue;
      number?: string;
      groupsCount?: number;
      contactsCount?: number;
      lastConnectionAt?: Date;
    },
  ): Promise<void> {
    if (!this.prisma.enabled) return;
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await this.prisma.whatsappSession.upsert({
      where: { workspaceSlug },
      create: { workspaceSlug, ...clean },
      update: clean,
    });
  }

  private async emit(workspaceSlug: string): Promise<void> {
    this.gateway.emitStatus(workspaceSlug, await this.status(workspaceSlug));
  }

  // ── Public API (controller + provider manager) ────────────────────────────
  async status(workspaceSlug: string): Promise<WhatsappStatus> {
    const row = this.prisma.enabled
      ? await this.prisma.whatsappSession.findUnique({ where: { workspaceSlug } })
      : null;
    const session = this.live.get(workspaceSlug);
    const owner = this.sessions.lockOwner(workspaceSlug);
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
      number: row?.number ?? null,
      lastConnectionAt: row?.lastConnectionAt?.toISOString() ?? null,
      groupsCount: row?.groupsCount ?? 0,
      contactsCount: row?.contactsCount ?? 0,
      error: session?.lastError ?? null,
      // El QR viaja también por HTTP para que el panel lo muestre aunque no haya
      // WebSocket (cPanel/LiteSpeed). Solo cuando el estado es "qr". Si el QR lo
      // generó otro proceso, se lee del archivo compartido.
      qr:
        statusValue === "qr"
          ? (this.qrs.get(workspaceSlug) ?? this.sessions.readQr(workspaceSlug))
          : null,
      diagnostics: {
        pid: process.pid,
        node: process.version,
        sessionDir: this.sessions.baseDir,
        hasCreds: this.sessions.hasSession(workspaceSlug),
        owner: owner ? { pid: owner.pid, fresh: owner.fresh, mine: owner.mine } : null,
        events: this.sessions.readEvents(workspaceSlug, 25),
      },
    };
  }

  /**
   * Active checks the operator can run from the panel when the QR does not
   * appear: can this process load Baileys, reach WhatsApp, write the session
   * directory, and who owns the socket. Every line is meant to be pasted back
   * to support as-is.
   */
  async diagnose(workspaceSlug: string): Promise<{ lines: string[] }> {
    const lines: string[] = [];
    const ok = (s: string) => lines.push(`✔ ${s}`);
    const bad = (s: string) => lines.push(`✖ ${s}`);
    lines.push(`Proceso pid ${process.pid} · Node ${process.version} · ${process.platform}/${process.arch}`);
    lines.push(`Directorio de sesión: ${this.sessions.baseDir}`);

    try {
      const probe = path.join(this.sessions.dirFor(workspaceSlug), `.write-test-${process.pid}`);
      fs.writeFileSync(probe, "ok");
      fs.rmSync(probe, { force: true });
      ok("El directorio de sesión se puede escribir.");
    } catch (e) {
      bad(`No se puede escribir el directorio de sesión: ${(e as Error).message}`);
    }

    lines.push(
      this.sessions.hasSession(workspaceSlug)
        ? "Hay credenciales guardadas (intentará reanudar; si están muertas pedirá QR nuevo)."
        : "Sin credenciales guardadas (pedirá QR)."
    );
    const owner = this.sessions.lockOwner(workspaceSlug);
    lines.push(
      owner
        ? `Dueño del socket: pid ${owner.pid} (${owner.fresh ? "vivo" : "caído"}${owner.mine ? ", este proceso" : ""}).`
        : "Nadie tiene el socket ahora mismo.",
    );
    const live = this.live.get(workspaceSlug);
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

    this.sessions.appendEvent(workspaceSlug, `Diagnóstico ejecutado: ${lines.filter((l) => l.startsWith("✖")).length} problema(s).`);
    return { lines };
  }

  async connect(workspaceSlug: string): Promise<WhatsappStatus> {
    await this.getOrCreate(workspaceSlug).start({ userInitiated: true });
    return this.status(workspaceSlug);
  }

  async reconnect(workspaceSlug: string): Promise<WhatsappStatus> {
    return this.connect(workspaceSlug);
  }

  /** "QR nuevo": forget the stored pairing and start a fresh QR pairing right away. */
  async relink(workspaceSlug: string): Promise<WhatsappStatus> {
    this.sessions.appendEvent(workspaceSlug, "«QR nuevo» pulsado: se borran las credenciales y se vuelve a vincular.");
    await this.live.get(workspaceSlug)?.logout();
    this.live.delete(workspaceSlug);
    this.sessions.deleteSession(workspaceSlug);
    await this.persist(workspaceSlug, { status: "disconnected", groupsCount: 0, contactsCount: 0 });
    return this.connect(workspaceSlug);
  }

  async disconnect(workspaceSlug: string): Promise<WhatsappStatus> {
    await this.live.get(workspaceSlug)?.logout();
    this.live.delete(workspaceSlug);
    await this.persist(workspaceSlug, {
      status: "disconnected",
      number: undefined,
      groupsCount: 0,
      contactsCount: 0,
    });
    return this.status(workspaceSlug);
  }

  async sync(workspaceSlug: string): Promise<WhatsappStatus> {
    await this.live.get(workspaceSlug)?.sync();
    return this.status(workspaceSlug);
  }

  isConnected(workspaceSlug: string): boolean {
    return this.live.get(workspaceSlug)?.isConnected ?? false;
  }

  sendText(workspaceSlug: string, to: string, text: string): Promise<{ id: string }> {
    const session = this.live.get(workspaceSlug);
    if (!session?.isConnected) {
      throw new Error("WhatsApp (Baileys) no está conectado en este workspace.");
    }
    return session.sendText(to, text);
  }

  /** List the WhatsApp groups synced for a workspace (most members first). */
  async listGroups(workspaceSlug: string) {
    if (!this.prisma.enabled) return [];
    return this.prisma.group.findMany({
      where: { workspaceSlug, channel: "wa", synced: true },
      orderBy: { members: "desc" },
    });
  }

  /** Send a message (optionally with media) to a group by its JID. */
  sendToGroup(
    workspaceSlug: string,
    remoteJid: string,
    text: string,
    attachment?: WhatsappAttachment | null,
  ): Promise<{ id: string }> {
    const session = this.live.get(workspaceSlug);
    if (!session?.isConnected) {
      throw new Error("WhatsApp (Baileys) no está conectado en este workspace.");
    }
    return session.sendToGroup(remoteJid, text, attachment);
  }

  /** Send media (or text) to any target — group JID, full JID, or phone number. */
  sendMedia(
    workspaceSlug: string,
    to: string,
    text: string,
    attachment?: WhatsappAttachment | null,
  ): Promise<{ id: string }> {
    const session = this.live.get(workspaceSlug);
    if (!session?.isConnected) {
      throw new Error("WhatsApp (Baileys) no está conectado en este workspace.");
    }
    return session.sendMedia(to, text, attachment);
  }

  /** Publish to the account's WhatsApp Status (Estados). */
  postStatus(
    workspaceSlug: string,
    text: string,
    attachment?: WhatsappAttachment | null,
  ): Promise<{ id: string }> {
    const session = this.live.get(workspaceSlug);
    if (!session?.isConnected) {
      throw new Error("WhatsApp (Baileys) no está conectado en este workspace.");
    }
    return session.postStatus(text, attachment);
  }
}
