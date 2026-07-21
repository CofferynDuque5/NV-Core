import { Controller, Get, Injectable, Module, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { CalendarEvent } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class CalendarService {
  async events(_workspaceId: string, _month?: string): Promise<CalendarEvent[]> {
    return [];
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
