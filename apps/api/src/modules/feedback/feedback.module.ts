import {
  Body,
  Controller,
  Injectable,
  Module,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { FEEDBACK_TYPES, type Feedback, type FeedbackType } from "@nv/domain";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

export class CreateFeedbackDto {
  @IsIn(FEEDBACK_TYPES) type!: FeedbackType;
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
  @IsString() @MinLength(1) @MaxLength(2000) message!: string;
}

interface FeedbackRow {
  id: string;
  type: string;
  rating: number | null;
  message: string;
  author: string;
  createdAt: Date;
}

function mapFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    type: row.type as FeedbackType,
    rating: row.rating ?? undefined,
    message: row.message,
    author: row.author,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  async submit(
    workspaceId: string,
    actor: { userId: string; email: string },
    dto: CreateFeedbackDto,
  ): Promise<Feedback> {
    if (!this.prisma.enabled) {
      throw new ServiceUnavailableException("Base de datos no configurada.");
    }
    const row = await this.prisma.feedback.create({
      data: {
        workspaceSlug: workspaceId,
        userId: actor.userId,
        author: actor.email,
        type: dto.type,
        rating: dto.rating ?? null,
        message: dto.message.trim(),
      },
    });
    await this.audit.record(workspaceId, actor.email, "feedback.submit", dto.type);
    return mapFeedback(row);
  }
}

@ApiTags("feedback")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/feedback")
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  submit(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.service.submit(workspaceId, { userId: user.userId, email: user.email }, dto);
  }
}

@Module({ controllers: [FeedbackController], providers: [FeedbackService] })
export class FeedbackModule {}
