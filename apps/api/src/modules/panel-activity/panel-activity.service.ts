import { Injectable } from "@nestjs/common";
import type { AdminActivity } from "@nv/domain";

import { PrismaService } from "../../prisma/prisma.service";
import { describeDevice, deviceKind } from "../../common/device";

/** Visits older than this are dropped. */
const KEEP_MS = 90 * 24 * 60 * 60 * 1000;
/** Most visits returned to the admin screen. */
const MAX_SESSIONS = 1000;

export const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;

/**
 * Section of a panel route: "/w/mi-marca/campanas/123" → "campanas",
 * "/w/mi-marca" → "dashboard", "/perfil" → "perfil", "/" → "inicio".
 */
export function sectionOf(path: string): { section: string; workspaceSlug: string | null } {
  const clean = path.split(/[?#]/)[0] ?? "/";
  const ws = /^\/w\/([^/]+)(?:\/([^/]+))?/.exec(clean);
  if (ws) return { workspaceSlug: decodeURIComponent(ws[1]!).slice(0, 80), section: (ws[2] ?? "dashboard").slice(0, 40) };
  const first = clean.split("/").filter(Boolean)[0];
  return { workspaceSlug: null, section: (first ?? "inicio").slice(0, 40) };
}

export interface PingMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Who uses the panel, where and for how long (super-admin «Usuarios y actividad»). */
@Injectable()
export class PanelActivityService {
  private lastCleanup = 0;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The panel tab says it is open on `path`. Creates the visit the first time,
   * then moves its «last seen» time and counts a page when the route changed.
   * A visit id that belongs to another user is ignored. Best effort.
   */
  async ping(
    user: { userId: string; demo?: boolean },
    sessionId: string,
    path: string,
    meta: PingMeta = {},
    now = new Date(),
  ): Promise<void> {
    if (!SESSION_ID_RE.test(sessionId)) return;
    const p = path.slice(0, 200);
    const { section, workspaceSlug } = sectionOf(p);
    try {
      const existing = await this.prisma.panelSession.findUnique({
        where: { id: sessionId },
        select: { userId: true, lastPath: true, sections: true },
      });
      if (!existing) {
        const ua = meta.userAgent?.slice(0, 300) ?? null;
        await this.prisma.panelSession.create({
          data: {
            id: sessionId,
            userId: user.userId,
            demo: Boolean(user.demo),
            ip: meta.ip?.slice(0, 64) ?? null,
            userAgent: ua,
            device: describeDevice(ua),
            deviceKind: deviceKind(ua),
            workspaceSlug,
            lastPath: p,
            pageViews: 1,
            sections: { [section]: 1 },
            startedAt: now,
            lastAt: now,
          },
        });
      } else if (existing.userId === user.userId) {
        const changed = existing.lastPath !== p;
        const sections = { ...((existing.sections as Record<string, number> | null) ?? {}) };
        if (changed) sections[section] = (sections[section] ?? 0) + 1;
        await this.prisma.panelSession.update({
          where: { id: sessionId },
          data: {
            lastAt: now,
            ...(changed
              ? { lastPath: p, pageViews: { increment: 1 }, sections, ...(workspaceSlug ? { workspaceSlug } : {}) }
              : {}),
          },
        });
      }
      if (!user.demo) {
        await this.prisma.user.update({ where: { id: user.userId }, data: { lastSeenAt: now } }).catch(() => undefined);
      }
      await this.cleanup(now);
    } catch {
      /* usage tracking never breaks the panel */
    }
  }

  /** Drop visits older than 90 days, at most once an hour. */
  private async cleanup(now: Date): Promise<void> {
    if (now.getTime() - this.lastCleanup < 60 * 60 * 1000) return;
    this.lastCleanup = now.getTime();
    await this.prisma.panelSession.deleteMany({ where: { lastAt: { lt: new Date(now.getTime() - KEEP_MS) } } });
  }

  /** Visits of the last `days` days, newest first, plus failed sign-ins. */
  async overview(days: number, now = new Date()): Promise<AdminActivity> {
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const [rows, failedLogins] = await Promise.all([
      this.prisma.panelSession.findMany({
        where: { lastAt: { gte: since } },
        orderBy: { lastAt: "desc" },
        take: MAX_SESSIONS,
        include: { user: { select: { email: true, name: true } } },
      }),
      this.prisma.loginEvent.count({ where: { method: "failed", at: { gte: since } } }),
    ]);
    return {
      since: since.toISOString(),
      failedLogins,
      sessions: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        email: r.user.email,
        name: r.user.name,
        demo: r.demo,
        device: r.device,
        deviceKind: (["movil", "tablet"].includes(r.deviceKind) ? r.deviceKind : "computadora") as
          | "movil"
          | "tablet"
          | "computadora",
        ip: r.ip,
        workspaceSlug: r.workspaceSlug,
        lastPath: r.lastPath,
        pageViews: r.pageViews,
        sections: (r.sections as Record<string, number> | null) ?? {},
        startedAt: r.startedAt.toISOString(),
        lastAt: r.lastAt.toISOString(),
      })),
    };
  }
}
