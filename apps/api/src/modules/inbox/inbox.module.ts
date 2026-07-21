import { Controller, Get, Injectable, Module, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Conversation, Message } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class InboxService {
  async conversations(_workspaceId: string): Promise<ListResultDto<Conversation>> {
    return ListResultDto.empty<Conversation>();
  }

  async messages(_workspaceId: string, _conversationId: string): Promise<Message[]> {
    return [];
  }
}

@ApiTags("inbox")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/inbox")
export class InboxController {
  constructor(private readonly service: InboxService) {}

  @Get("conversations")
  conversations(@WorkspaceId() workspaceId: string) {
    return this.service.conversations(workspaceId);
  }

  @Get("conversations/:id/messages")
  messages(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.messages(workspaceId, id);
  }
}

@Module({ controllers: [InboxController], providers: [InboxService] })
export class InboxModule {}
