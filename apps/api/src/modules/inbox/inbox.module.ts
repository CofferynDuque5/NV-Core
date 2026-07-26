import {
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { CHANNEL_IDS, type ChannelId, type Conversation, type Message } from "@nv/domain";
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { mapConversation, mapMessage } from "../../prisma/mappers";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { MessagingModule, MessagingService } from "../messaging/messaging.module";

export class CreateConversationDto {
  @IsIn(CHANNEL_IDS) channel!: ChannelId;
  @IsString() @MinLength(1) contactName!: string;

  @ApiPropertyOptional({ description: "WhatsApp (E.164) o chat id de Telegram para envío saliente." })
  @IsOptional()
  @IsString()
  contactHandle?: string;
}

export class SendMessageDto {
  @IsString() @MinLength(1) text!: string;
}

export class SetResolvedDto {
  @IsBoolean() resolved!: boolean;
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  private async owned(workspaceId: string, id: string) {
    const conv = await this.db().conversation.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!conv) throw new NotFoundException("Conversación no encontrada.");
    return conv;
  }

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

  async createConversation(
    workspaceId: string,
    dto: CreateConversationDto,
  ): Promise<Conversation> {
    const row = await this.db().conversation.create({
      data: {
        workspaceSlug: workspaceId,
        channel: dto.channel,
        contactName: dto.contactName,
        contactHandle: dto.contactHandle,
      },
    });
    return mapConversation(row);
  }

  async sendMessage(
    workspaceId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<Message> {
    const conv = await this.owned(workspaceId, conversationId);
    const row = await this.prisma.message.create({
      data: { conversationId, direction: "out", text: dto.text },
    });

    // Best-effort external delivery: never blocks or fails the persisted reply.
    if (conv.contactHandle && this.messaging.isConfigured(conv.channel)) {
      void this.messaging
        .send(workspaceId, { channel: conv.channel, to: conv.contactHandle, body: dto.text })
        .catch((err: unknown) =>
          this.logger.warn(`Outbound delivery failed for ${conversationId}: ${(err as Error).message}`),
        );
    }

    return mapMessage(row);
  }

  async setResolved(
    workspaceId: string,
    conversationId: string,
    resolved: boolean,
  ): Promise<Conversation> {
    await this.owned(workspaceId, conversationId);
    const row = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { resolved },
    });
    return mapConversation(row);
  }
}

@ApiTags("inbox")
@ApiBearerAuth()
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

  @Post("conversations")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  createConversation(@WorkspaceId() workspaceId: string, @Body() dto: CreateConversationDto) {
    return this.service.createConversation(workspaceId, dto);
  }

  @Post("conversations/:id/messages")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  sendMessage(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.service.sendMessage(workspaceId, id, dto);
  }

  @Patch("conversations/:id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  setResolved(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body() dto: SetResolvedDto,
  ) {
    return this.service.setResolved(workspaceId, id, dto.resolved);
  }
}

@Module({
  imports: [MessagingModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
