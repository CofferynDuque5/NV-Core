import { Controller, Get, Injectable, Module, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Contact } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class ContactsService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async list(workspaceId: string, _query: PaginationQueryDto): Promise<ListResultDto<Contact>> {
    // TODO(phase 2): query Prisma scoped by workspaceId.
    return ListResultDto.empty<Contact>();
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
