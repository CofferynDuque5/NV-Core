import { Controller, Get, Injectable, Module, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Conversation, Message } from "@nv/domain";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapConversation, mapMessage } from "../../prisma/mappers";

@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  async conversations(workspaceId: string): Promise<ListResultDto<Conversation>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Conversation>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.prisma.conversation.count({ where }),
    ]);
    return new ListResultDto(rows.map(mapConversation), total);
  }

  async messages(workspaceId: string, conversationId: string): Promise<Message[]> {
    if (!this.prisma.enabled) return [];
    const rows = await this.prisma.message.findMany({
      where: { conversationId, conversation: { workspaceSlug: workspaceId } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapMessage);
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
