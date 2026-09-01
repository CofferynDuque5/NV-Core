import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { EventBus } from "../../core/events/event-bus.service";
import { NotificationsService } from "../notifications/notifications.module";
import { BaileysSession } from "./baileys.session";
import { SessionManager } from "./session-manager";
import { WhatsappGateway } from "./whatsapp.gateway";
import type {
  SessionAlert,
  SessionEvents,
  WhatsappAttachment,
  WhatsappGroup,
  WhatsappStatus,
  WhatsappStatusValue,
} from "./whatsapp.types";

@Injectable()
export class WhatsappService implements SessionEvents, OnModuleInit {
  private readonly sessions: SessionManager;
  private readonly live = new Map<string, BaileysSession>();

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly gateway: WhatsappGateway,
    private readonly events: EventBus,
    private readonly notifications: NotificationsService,
  ) {
    this.sessions = new SessionManager(config.get("integrations", { infer: true }).whatsappSessionDir);
  }

  /** On boot, resume any workspace that still has stored credentials. */
  async onModuleInit(): Promise<void> {
    for (const slug of this.sessions.listSessions()) {
      void this.getOrCreate(slug).start();
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
    this.gateway.emitQr(workspaceSlug, dataUrl);
  }

  onStatus(workspaceSlug: string, status: WhatsappStatusValue): void {
    void this.persist(workspaceSlug, { status }).then(() => this.emit(workspaceSlug));
  }

  onMeta(
    workspaceSlug: string,
    meta: { number?: string | null; groupsCount?: number; contactsCount?: number; connectedAt?: Date },
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
    return {
      status: session?.currentStatus ?? (row?.status as WhatsappStatusValue) ?? "disconnected",
      provider: "baileys",
      number: row?.number ?? null,
      lastConnectionAt: row?.lastConnectionAt?.toISOString() ?? null,
      groupsCount: row?.groupsCount ?? 0,
      contactsCount: row?.contactsCount ?? 0,
      error: session?.lastError ?? null,
    };
  }

  async connect(workspaceSlug: string): Promise<WhatsappStatus> {
    await this.getOrCreate(workspaceSlug).start();
    return this.status(workspaceSlug);
  }

  async reconnect(workspaceSlug: string): Promise<WhatsappStatus> {
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
