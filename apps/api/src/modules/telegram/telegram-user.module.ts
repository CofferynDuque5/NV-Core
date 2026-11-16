import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CredentialsModule } from "../credentials/credentials.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TelegramGateway } from "./telegram.gateway";
import { TelegramUserService } from "./telegram-user.service";

class TelegramPasswordDto {
  @IsString() @MinLength(1) password!: string;
}

class TelegramLineDto {
  @IsOptional() @IsString() @MaxLength(40) label?: string;
}

@ApiTags("telegram")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/telegram")
export class TelegramUserController {
  constructor(private readonly service: TelegramUserService) {}

  @Get("status")
  status(@WorkspaceId() workspaceId: string) {
    return this.service.status(workspaceId);
  }

  @Post("connect")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  connect(@WorkspaceId() workspaceId: string) {
    return this.service.connect(workspaceId);
  }

  @Post("reconnect")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  reconnect(@WorkspaceId() workspaceId: string) {
    return this.service.reconnect(workspaceId);
  }

  @Post("disconnect")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  disconnect(@WorkspaceId() workspaceId: string) {
    return this.service.disconnect(workspaceId);
  }

  @Post("sync")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  sync(@WorkspaceId() workspaceId: string) {
    return this.service.sync(workspaceId);
  }

  @Post("password")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  password(@WorkspaceId() workspaceId: string, @Body() dto: TelegramPasswordDto) {
    return this.service.submitPassword(workspaceId, dto.password);
  }

  // ── Extra accounts (lines). Line 1 is the main account above. ────────────
  @Get("lines")
  lines(@WorkspaceId() workspaceId: string) {
    return this.service.lines(workspaceId);
  }

  @Post("lines")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  addLine(@WorkspaceId() workspaceId: string, @Body() dto: TelegramLineDto) {
    return this.service.addLine(workspaceId, dto.label);
  }

  @Get("lines/:line/status")
  lineStatus(@WorkspaceId() workspaceId: string, @Param("line", ParseIntPipe) line: number) {
    return this.service.status(workspaceId, line);
  }

  @Patch("lines/:line")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  renameLine(
    @WorkspaceId() workspaceId: string,
    @Param("line", ParseIntPipe) line: number,
    @Body() dto: TelegramLineDto,
  ) {
    return this.service.renameLine(workspaceId, line, dto.label ?? null);
  }

  @Post("lines/:line/password")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  linePassword(
    @WorkspaceId() workspaceId: string,
    @Param("line", ParseIntPipe) line: number,
    @Body() dto: TelegramPasswordDto,
  ) {
    return this.service.submitPassword(workspaceId, dto.password, line);
  }

  @Post("lines/:line/:action")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  lineAction(
    @WorkspaceId() workspaceId: string,
    @Param("line", ParseIntPipe) line: number,
    @Param("action") action: string,
  ) {
    if (action === "connect") return this.service.connect(workspaceId, line);
    if (action === "disconnect") return this.service.disconnect(workspaceId, line);
    if (action === "sync") return this.service.sync(workspaceId, line);
    throw new BadRequestException("Acción no válida.");
  }

  @Delete("lines/:line")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  removeLine(@WorkspaceId() workspaceId: string, @Param("line", ParseIntPipe) line: number) {
    return this.service.removeLine(workspaceId, line);
  }
}

@Module({
  imports: [NotificationsModule, CredentialsModule],
  controllers: [TelegramUserController],
  providers: [TelegramUserService, TelegramGateway],
  exports: [TelegramUserService],
})
export class TelegramUserModule {}
