import { Controller, Get, Injectable, Module, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Contact } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapContact } from "../../prisma/mappers";

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string, query: PaginationQueryDto): Promise<ListResultDto<Contact>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Contact>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapContact), total);
  }
}

@ApiTags("contacts")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/contacts")
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string, @Query() query: PaginationQueryDto) {
    return this.service.list(workspaceId, query);
  }
}

@Module({ controllers: [ContactsController], providers: [ContactsService] })
export class ContactsModule {}
