import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import { BaileysSession } from "./baileys.session";
import { SessionManager } from "./session-manager";
import { WhatsappGateway } from "./whatsapp.gateway";
import type { SessionEvents, WhatsappStatus, WhatsappStatusValue } from "./whatsapp.types";

@Injectable()
export class WhatsappService implements SessionEvents, OnModuleInit {
  private readonly sessions: SessionManager;
  private readonly live = new Map<string, BaileysSession>();

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly gateway: WhatsappGateway,
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
    const liveStatus = this.live.get(workspaceSlug)?.currentStatus;
    return {
      status: liveStatus ?? (row?.status as WhatsappStatusValue) ?? "disconnected",
      provider: "baileys",
      number: row?.number ?? null,
      lastConnectionAt: row?.lastConnectionAt?.toISOString() ?? null,
      groupsCount: row?.groupsCount ?? 0,
      contactsCount: row?.contactsCount ?? 0,
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
}
