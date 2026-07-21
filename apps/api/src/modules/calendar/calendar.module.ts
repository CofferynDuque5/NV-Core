import { Controller, Get, Injectable, Module, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { CalendarEvent } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapCalendarEvent } from "../../prisma/mappers";

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async events(workspaceId: string, month?: string): Promise<CalendarEvent[]> {
    if (!this.prisma.enabled) return [];
    const where: { workspaceSlug: string; date?: { gte: Date; lt: Date } } = {
      workspaceSlug: workspaceId,
    };
    // Optional month filter: "YYYY-MM".
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      const gte = new Date(Date.UTC(y!, m! - 1, 1));
      const lt = new Date(Date.UTC(y!, m!, 1));
      where.date = { gte, lt };
    }
    const rows = await this.prisma.calendarEvent.findMany({ where, orderBy: { date: "asc" } });
    return rows.map(mapCalendarEvent);
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
