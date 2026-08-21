import { Controller, Get, Injectable, Module, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { CalendarEvent } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapCalendarEvent } from "../../prisma/mappers";
import { LIST_CAP } from "../../common/query-limits";
import { campaignOccurrences } from "./campaign-occurrences";

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async events(workspaceId: string, month?: string): Promise<CalendarEvent[]> {
    if (!this.prisma.enabled) return [];
    const where: { workspaceSlug: string; date?: { gte: Date; lt: Date } } = {
      workspaceSlug: workspaceId,
    };
    let range: { gte: Date; lt: Date } | null = null;
    // Optional month filter: "YYYY-MM".
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      range = { gte: new Date(Date.UTC(y!, m! - 1, 1)), lt: new Date(Date.UTC(y!, m!, 1)) };
      where.date = range;
    }
    const rows = await this.prisma.calendarEvent.findMany({ where, orderBy: { date: "asc" }, take: LIST_CAP });
    const stored = rows.map(mapCalendarEvent);

    // Overlay scheduled campaigns so they appear on the calendar automatically.
    // Only when a month is given (avoids unbounded expansion).
    if (!range) return stored;
    const campaigns = await this.prisma.campaign.findMany({
      where: { workspaceSlug: workspaceId, status: { in: ["programada", "activa"] } },
      take: LIST_CAP,
    });
    const occurrences = campaigns.flatMap((c) =>
      campaignOccurrences(
        {
          id: c.id,
          name: c.name,
          status: c.status,
          channels: c.channels as string[],
          scheduleType: c.scheduleType,
          scheduleAt: c.scheduleAt,
          scheduleTimes: c.scheduleTimes ?? [],
          scheduleDays: c.scheduleDays ?? [],
        },
        range!.gte,
        range!.lt,
      ),
    );
    return [...stored, ...occurrences];
  }
}

@ApiTags("calendar")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/calendar")
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get("events")
  events(@WorkspaceId() workspaceId: string, @Query("month") month?: string) {
    return this.service.events(workspaceId, month);
  }
}

@Module({ controllers: [CalendarController], providers: [CalendarService] })
export class CalendarModule {}
