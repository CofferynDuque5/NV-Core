import {
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Put,
  UseGuards,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { Prisma } from "@prisma/client";
import {
  DEFAULT_REPORT_TIME_ZONE,
  REPORT_TIME_ZONES,
  formatPaymentAmount,
  isReportTimeZone,
  type PaymentCurrency,
  type WeeklyReport,
  type WeeklyReportAttention,
  type WeeklyReportMetric,
  type WeeklyReportSettings,
  type WeeklyReportSummary,
} from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogger } from "../../common/audit-logger.service";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { NotificationsModule, NotificationsService } from "../notifications/notifications.module";
import {
  ATTENTION_ITEMS,
  CAMPAIGN_WINDOW_MS,
  DAY_MS,
  WEEK_MS,
  dayKey,
  lastClosedLocalWeek,
  localWeekStart,
  mergePaymentTotals,
  noticeMeta,
  parseWeekStart,
  phoneKey,
  rankLeadSources,
  shortDay,
  summarizeInbox,
  weekBounds,
  type InboxConversationRow,
} from "./weekly-report";

/** How often the sweep checks for weeks without a report. */
const SWEEP_MS = 60 * 60_000;
/** First sweep shortly after boot, so a restart on Monday still produces it. */
const FIRST_SWEEP_MS = 60_000;
/** Reports listed in the history. */
const HISTORY = 26;

type Range = { gte: Date; lt: Date };
/** Conversations read per week for the Inbox section (a busy brand's week fits). */
const INBOX_ROWS = 5000;

export class WeeklyReportSettingsDto {
  @ApiProperty({ enum: REPORT_TIME_ZONES.map((z) => z.id) })
  @IsIn(REPORT_TIME_ZONES.map((z) => z.id), { message: "Zona horaria no válida." })
  timeZone!: string;
}

/**
 * Weekly workspace report. Every closed week (Monday → Monday, UTC) each
 * workspace in use gets one frozen report and an in-app notice; the current
 * week can be previewed live. Nothing is sent outside the app.
 *
 * Restart-safe without Redis: the hourly sweep looks for the missing report
 * and the (workspace, week) unique key makes concurrent generation create it
 * once and notify once.
 */
@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsService.name);
  private timers: NodeJS.Timeout[] = [];
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogger,
  ) {}

  onModuleInit(): void {
    if (!this.prisma.enabled) return;
    const run = () =>
      void this.sweep().catch((err: unknown) =>
        this.logger.warn(`Informe semanal: el barrido falló: ${(err as Error).message}`),
      );
    this.timers.push(setTimeout(run, FIRST_SWEEP_MS), setInterval(run, SWEEP_MS));
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearTimeout(t);
  }

  /** Generate last week's report for every workspace in use that lacks it. Returns how many were created. */
  async sweep(now = new Date()): Promise<number> {
    if (!this.prisma.enabled || this.sweeping) return 0;
    this.sweeping = true;
    try {
      // Workspaces in use (unclaimed demos are skipped), each with its own zone.
      const members = await this.prisma.membership.groupBy({
        by: ["workspaceSlug"],
        where: { createdAt: { lt: now } },
        _min: { createdAt: true },
      });
      const zones = await this.timeZones(members.map((m) => m.workspaceSlug));
      const due = members
        .map((m) => {
          const tz = zones.get(m.workspaceSlug) ?? DEFAULT_REPORT_TIME_ZONE;
          const weekStart = lastClosedLocalWeek(now, tz);
          return { workspaceSlug: m.workspaceSlug, tz, weekStart, firstMember: m._min.createdAt! };
        })
        // Someone had joined before the week ended.
        .filter((w) => w.firstMember < weekBounds(w.weekStart, w.tz).to);
      const done = await this.prisma.weeklyReport.findMany({
        where: { OR: due.map((w) => ({ workspaceSlug: w.workspaceSlug, weekStart: w.weekStart })) },
        select: { workspaceSlug: true },
      });
      const have = new Set(done.map((r) => r.workspaceSlug));
      let created = 0;
      for (const { workspaceSlug, weekStart, tz } of due) {
        if (have.has(workspaceSlug)) continue;
        try {
          if (await this.generate(workspaceSlug, weekStart, tz)) created++;
        } catch (err) {
          this.logger.warn(`Informe semanal de ${workspaceSlug}: ${(err as Error).message}`);
        }
      }
      return created;
    } finally {
      this.sweeping = false;
    }
  }

  /** Build, store and announce one closed week. False when it already existed. */
  async generate(workspaceSlug: string, weekStart: Date, tz?: string): Promise<boolean> {
    const zone = tz ?? (await this.timeZone(workspaceSlug));
    const data = await this.build(workspaceSlug, weekStart, zone);
    try {
      const row = await this.prisma.weeklyReport.create({
        data: { workspaceSlug, weekStart, data: data as unknown as Prisma.InputJsonValue },
      });
      const report = this.map(row);
      await this.notifications.create(workspaceSlug, {
        type: report.attention.length > 0 ? "warning" : "info",
        title: "Tu resumen semanal está listo",
        meta: noticeMeta(report),
      });
      return true;
    } catch (err) {
      // Another instance (or sweep) stored it first: keep that one, notify once.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
      throw err;
    }
  }

  async list(workspaceSlug: string): Promise<WeeklyReportSummary[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.weeklyReport.findMany({
      where: { workspaceSlug },
      orderBy: { weekStart: "desc" },
      take: HISTORY,
      select: { id: true, weekStart: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      weekStart: dayKey(r.weekStart),
      weekEnd: dayKey(new Date(r.weekStart.getTime() + WEEK_MS - DAY_MS)),
      generatedAt: r.createdAt.toISOString(),
    }));
  }

  async get(workspaceSlug: string, week: string): Promise<WeeklyReport> {
    const weekStart = parseWeekStart(week);
    if (!weekStart) throw new NotFoundException("La semana debe empezar en lunes (AAAA-MM-DD).");
    const row = this.prisma.enabled
      ? await this.prisma.weeklyReport.findUnique({ where: { workspaceSlug_weekStart: { workspaceSlug, weekStart } } })
      : null;
    if (!row) throw new NotFoundException("No hay informe para esa semana.");
    return this.map(row);
  }

  /** The current week so far, compared with the same span of last week. Not stored. */
  async current(workspaceSlug: string, now = new Date()): Promise<WeeklyReport> {
    const tz = await this.timeZone(workspaceSlug);
    const report = await this.build(workspaceSlug, localWeekStart(now, tz), tz, now);
    return { ...report, id: "actual" };
  }

  async settings(workspaceSlug: string): Promise<WeeklyReportSettings> {
    return { timeZone: await this.timeZone(workspaceSlug) };
  }

  /** Change the zone. Stored reports keep the zone they were cut in; the next ones use the new one. */
  async updateSettings(workspaceSlug: string, actor: string, input: WeeklyReportSettingsDto): Promise<WeeklyReportSettings> {
    if (!this.prisma.enabled) return { timeZone: DEFAULT_REPORT_TIME_ZONE };
    const row = await this.prisma.workspaceSettings.upsert({
      where: { workspaceSlug },
      create: { workspaceSlug, timeZone: input.timeZone, updatedBy: actor },
      update: { timeZone: input.timeZone, updatedBy: actor },
    });
    await this.audit.record(workspaceSlug, actor, "report.settings", `Zona horaria del informe: ${row.timeZone}`);
    return { timeZone: row.timeZone };
  }

  private async timeZone(workspaceSlug: string): Promise<string> {
    return (await this.timeZones([workspaceSlug])).get(workspaceSlug) ?? DEFAULT_REPORT_TIME_ZONE;
  }

  /** Saved zones; workspaces without a valid one fall back to UTC. */
  private async timeZones(slugs: string[]): Promise<Map<string, string>> {
    if (!this.prisma.enabled || slugs.length === 0) return new Map();
    const rows = await this.prisma.workspaceSettings.findMany({ where: { workspaceSlug: { in: slugs } } });
    return new Map(rows.filter((r) => isReportTimeZone(r.timeZone)).map((r) => [r.workspaceSlug, r.timeZone]));
  }

  /**
   * Counts for the week starting `weekStart` (Monday 00:00 in `tz`), up to
   * `until` for the live week, next to the same span one week earlier, plus
   * what needs someone right now. Every number is a DB count of the
   * workspace's own rows.
   */
  async build(workspaceSlug: string, weekStart: Date, tz: string, until?: Date): Promise<WeeklyReport> {
    const week = weekBounds(weekStart, tz);
    const before = weekBounds(new Date(weekStart.getTime() - WEEK_MS), tz);
    const to = until ?? week.to;
    const from = week.from;
    const cur: Range = { gte: from, lt: to };
    const prev: Range = { gte: before.from, lt: until ? new Date(before.from.getTime() + (to.getTime() - from.getTime())) : before.to };
    const ws = { workspaceSlug };
    const now = new Date();

    const counters: { key: string; label: string; source: string; count: (r: Range) => Promise<number> }[] = [
      {
        key: "contacts",
        label: "Contactos nuevos",
        source: "Contactos creados en el CRM en la semana.",
        count: (r) => this.prisma.contact.count({ where: { ...ws, createdAt: r } }),
      },
      {
        key: "conversations",
        label: "Conversaciones nuevas",
        source: "Conversaciones abiertas en el Inbox en la semana.",
        count: (r) => this.prisma.conversation.count({ where: { ...ws, createdAt: r } }),
      },
      {
        key: "messagesIn",
        label: "Mensajes recibidos",
        source: "Mensajes entrantes del Inbox.",
        count: (r) => this.prisma.message.count({ where: { direction: "in", conversation: ws, createdAt: r } }),
      },
      {
        key: "messagesOut",
        label: "Mensajes enviados",
        source: "Respuestas salientes del Inbox (equipo, IA y automatizaciones).",
        count: (r) => this.prisma.message.count({ where: { direction: "out", conversation: ws, createdAt: r } }),
      },
      {
        key: "postsSent",
        label: "Publicaciones enviadas",
        source: "Publicaciones en estado «enviada» programadas (o creadas, si no tenían fecha) en la semana.",
        count: (r) =>
          this.prisma.post.count({
            where: { ...ws, status: "sent", OR: [{ scheduledAt: r }, { scheduledAt: null, createdAt: r }] },
          }),
      },
      {
        key: "campaignSends",
        label: "Envíos de campañas",
        source: "Envíos de campañas confirmados por el canal (registro de envíos).",
        count: (r) => this.prisma.sendLog.count({ where: { ...ws, ok: true, createdAt: r } }),
      },
      {
        key: "automationRuns",
        label: "Automatizaciones que actuaron",
        source: "Ejecuciones de automatizaciones que hicieron algo (no incluye omitidas ni con error).",
        count: (r) => this.prisma.automationRun.count({ where: { ...ws, status: "ok", startedAt: r } }),
      },
      {
        key: "tasksDone",
        label: "Tareas completadas",
        source: "Tareas movidas a «Hecha» en la semana.",
        count: (r) => this.prisma.task.count({ where: { ...ws, completedAt: r } }),
      },
    ];

    const paidIn = (r: Range) =>
      this.prisma.paymentRequest.groupBy({
        by: ["currency"],
        where: { ...ws, status: "pagado", paidAt: r },
        _sum: { amount: true },
        _count: { _all: true },
      });

    const [values, previous, leadRows, attention, paidNow, paidBefore, inbox] = await Promise.all([
      Promise.all(counters.map((c) => c.count(cur))),
      Promise.all(counters.map((c) => c.count(prev))),
      this.prisma.$queryRaw<{ source: string | null; n: number }[]>(Prisma.sql`
        SELECT "attribution"->>'source' AS source, COUNT(*)::int AS n
        FROM "Contact"
        WHERE "workspaceSlug" = ${workspaceSlug} AND "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY 1
      `),
      this.attention(workspaceSlug, cur, now, tz),
      paidIn(cur),
      paidIn(prev),
      this.inbox(workspaceSlug, cur, prev),
    ]);
    const sums = (rows: Awaited<ReturnType<typeof paidIn>>) =>
      rows.map((g) => ({ currency: g.currency, amount: g._sum.amount, count: g._count._all }));

    const metrics: WeeklyReportMetric[] = counters.map((c, i) => ({
      key: c.key,
      label: c.label,
      value: values[i]!,
      previous: previous[i]!,
      source: c.source,
    }));

    return {
      id: "",
      weekStart: dayKey(weekStart),
      weekEnd: dayKey(new Date(weekStart.getTime() + WEEK_MS - DAY_MS)),
      generatedAt: now.toISOString(),
      timeZone: tz,
      metrics,
      leadSources: rankLeadSources(leadRows),
      attention,
      payments: mergePaymentTotals(sums(paidNow), sums(paidBefore)),
      inbox: { ...inbox, messagesIn: values[counters.findIndex((c) => c.key === "messagesIn")] ?? 0 },
    };
  }

  /**
   * New conversations of the week (and of the span before), with their first
   * customer message and first answer, plus what the panel did that could
   * have brought them: confirmed campaign sends and form/funnel contacts.
   */
  private async inbox(workspaceSlug: string, cur: Range, prev: Range) {
    const conversations = (r: Range) =>
      this.prisma.$queryRaw<InboxConversationRow[]>(Prisma.sql`
        SELECT c."channel"::text AS channel, c."createdAt", c."contactHandle",
          (SELECT MIN(m."createdAt") FROM "Message" m WHERE m."conversationId" = c.id AND m."direction" = 'in') AS "firstIn",
          (SELECT MIN(o."createdAt") FROM "Message" o WHERE o."conversationId" = c.id AND o."direction" = 'out'
             AND o."createdAt" >= COALESCE(
               (SELECT MIN(i."createdAt") FROM "Message" i WHERE i."conversationId" = c.id AND i."direction" = 'in'),
               c."createdAt")) AS "firstOut"
        FROM "Conversation" c
        WHERE c."workspaceSlug" = ${workspaceSlug} AND c."createdAt" >= ${r.gte} AND c."createdAt" < ${r.lt}
        ORDER BY c."createdAt" ASC
        LIMIT ${INBOX_ROWS}
      `);
    const [rows, previousRows, sends, formContacts] = await Promise.all([
      conversations(cur),
      conversations(prev),
      this.prisma.sendLog.findMany({
        where: {
          workspaceSlug,
          ok: true,
          createdAt: { gte: new Date(prev.gte.getTime() - CAMPAIGN_WINDOW_MS), lt: cur.lt },
        },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: INBOX_ROWS * 4,
      }),
      this.prisma.contact.findMany({
        where: { workspaceSlug, phone: { not: null }, NOT: { attribution: { equals: Prisma.DbNull } } },
        select: { phone: true },
        orderBy: { createdAt: "desc" },
        take: INBOX_ROWS * 4,
      }),
    ]);
    const formPhones = new Set(formContacts.map((c) => phoneKey(c.phone)).filter((k): k is string => k !== null));
    return summarizeInbox({
      rows,
      previousRows,
      messagesIn: 0,
      sendTimes: sends.map((s) => s.createdAt),
      formPhones,
    });
  }

  /** What needs someone: open items now, and failures inside the week. Empty entries are left out. */
  private async attention(workspaceSlug: string, week: Range, now: Date, tz: string): Promise<WeeklyReportAttention[]> {
    const fmtDay = (d: Date) => shortDay(d, tz);
    const ws = { workspaceSlug };
    const overdueWhere = { ...ws, status: { not: "done" }, dueAt: { lt: now } };
    const humanWhere = { ...ws, resolved: false, labels: { has: "requiere-humano" } };
    const postWhere = {
      ...ws,
      status: "error" as const,
      OR: [{ scheduledAt: week }, { scheduledAt: null, createdAt: week }],
    };
    const sendWhere = { ...ws, ok: false, createdAt: week };
    const runWhere = { ...ws, status: "error", startedAt: week };
    const toVerifyWhere = { ...ws, status: "por_verificar" };
    const overduePayWhere = { ...ws, status: "pendiente", dueAt: { lt: now } };

    const [
      overdueN,
      overdue,
      unanswered,
      humanN,
      human,
      postsN,
      posts,
      sendsN,
      sends,
      runsN,
      runs,
      toVerifyN,
      toVerify,
      overduePayN,
      overduePay,
    ] = await Promise.all([
      this.prisma.task.count({ where: overdueWhere }),
      this.prisma.task.findMany({ where: overdueWhere, orderBy: { dueAt: "asc" }, take: ATTENTION_ITEMS }),
      // Open conversations whose latest message is the customer's.
      this.prisma.$queryRaw<{ id: string; contactName: string; at: Date; total: number }[]>(Prisma.sql`
        SELECT c.id, c."contactName", m."createdAt" AS at, COUNT(*) OVER()::int AS total
        FROM "Conversation" c
        JOIN LATERAL (
          SELECT direction, "createdAt" FROM "Message"
          WHERE "conversationId" = c.id ORDER BY "createdAt" DESC LIMIT 1
        ) m ON true
        WHERE c."workspaceSlug" = ${workspaceSlug} AND c.resolved = false AND m.direction = 'in'
        ORDER BY m."createdAt" ASC
        LIMIT ${ATTENTION_ITEMS}
      `),
      this.prisma.conversation.count({ where: humanWhere }),
      this.prisma.conversation.findMany({ where: humanWhere, orderBy: { createdAt: "asc" }, take: ATTENTION_ITEMS }),
      this.prisma.post.count({ where: postWhere }),
      this.prisma.post.findMany({ where: postWhere, orderBy: { createdAt: "desc" }, take: ATTENTION_ITEMS }),
      this.prisma.sendLog.count({ where: sendWhere }),
      this.prisma.sendLog.findMany({ where: sendWhere, orderBy: { createdAt: "desc" }, take: ATTENTION_ITEMS }),
      this.prisma.automationRun.count({ where: runWhere }),
      this.prisma.automationRun.findMany({
        where: runWhere,
        orderBy: { startedAt: "desc" },
        take: ATTENTION_ITEMS,
        include: { automation: { select: { name: true } } },
      }),
      this.prisma.paymentRequest.count({ where: toVerifyWhere }),
      this.prisma.paymentRequest.findMany({ where: toVerifyWhere, orderBy: { updatedAt: "asc" }, take: ATTENTION_ITEMS }),
      this.prisma.paymentRequest.count({ where: overduePayWhere }),
      this.prisma.paymentRequest.findMany({ where: overduePayWhere, orderBy: { dueAt: "asc" }, take: ATTENTION_ITEMS }),
    ]);
    const money = (p: { amount: Prisma.Decimal; currency: string }) =>
      formatPaymentAmount(Number(p.amount.toString()), p.currency as PaymentCurrency);

    const out: WeeklyReportAttention[] = [
      {
        key: "overdueTasks",
        label: "Tareas vencidas",
        section: "tareas",
        count: overdueN,
        items: overdue.map((t) => ({
          id: t.id,
          label: t.title,
          meta: [`vencía ${fmtDay(t.dueAt!)}`, t.assignee].filter(Boolean).join(" · "),
        })),
      },
      {
        key: "unanswered",
        label: "Conversaciones sin responder",
        section: "inbox",
        count: unanswered[0]?.total ?? 0,
        items: unanswered.map((c) => ({ id: c.id, label: c.contactName, meta: `escribió el ${fmtDay(c.at)}` })),
      },
      {
        key: "needsHuman",
        label: "Piden hablar con una persona",
        section: "inbox",
        count: humanN,
        items: human.map((c) => ({ id: c.id, label: c.contactName })),
      },
      {
        key: "postErrors",
        label: "Publicaciones que fallaron",
        section: "calendario",
        count: postsN,
        items: posts.map((p) => ({ id: p.id, label: p.title, meta: p.channel })),
      },
      {
        key: "sendErrors",
        label: "Envíos de campañas fallidos",
        section: "campanas",
        count: sendsN,
        items: sends.map((s) => ({
          id: s.id,
          label: [s.campaignName, s.groupName].filter(Boolean).join(" → ") || "Envío",
          meta: s.error ?? undefined,
        })),
      },
      {
        key: "automationErrors",
        label: "Automatizaciones con error",
        section: "automatizaciones",
        count: runsN,
        items: runs.map((r) => ({ id: r.id, label: r.automation.name, meta: r.error ?? undefined })),
      },
      {
        key: "paymentsToVerify",
        label: "Cobros por verificar",
        section: "cobros",
        count: toVerifyN,
        items: toVerify.map((p) => ({
          id: p.id,
          label: p.concept,
          meta: [money(p), p.methodLabel, p.reference ? `ref ${p.reference}` : null].filter(Boolean).join(" · "),
        })),
      },
      {
        key: "overduePayments",
        label: "Cobros vencidos sin pagar",
        section: "cobros",
        count: overduePayN,
        items: overduePay.map((p) => ({ id: p.id, label: p.concept, meta: `${money(p)} · vencía ${fmtDay(p.dueAt!)}` })),
      },
    ];
    return out.filter((a) => a.count > 0);
  }

  private map(row: { id: string; weekStart: Date; createdAt: Date; data: Prisma.JsonValue }): WeeklyReport {
    const data = row.data as unknown as WeeklyReport;
    return {
      ...data,
      id: row.id,
      weekStart: dayKey(row.weekStart),
      weekEnd: dayKey(new Date(row.weekStart.getTime() + WEEK_MS - DAY_MS)),
      generatedAt: row.createdAt.toISOString(),
    };
  }
}

@ApiTags("reports")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/reports/weekly")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  /** This week so far (live, not stored). */
  @Get("actual")
  current(@WorkspaceId() workspaceId: string) {
    return this.service.current(workspaceId);
  }

  @Get("settings")
  settings(@WorkspaceId() workspaceId: string) {
    return this.service.settings(workspaceId);
  }

  @Put("settings")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  updateSettings(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WeeklyReportSettingsDto,
  ) {
    return this.service.updateSettings(workspaceId, user.email, dto);
  }

  @Get(":week")
  get(@WorkspaceId() workspaceId: string, @Param("week") week: string) {
    return this.service.get(workspaceId, week);
  }
}

@Module({ imports: [NotificationsModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
