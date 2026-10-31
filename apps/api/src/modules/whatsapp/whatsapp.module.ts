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
import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { NotificationsModule } from "../notifications/notifications.module";
import { WhatsappGateway } from "./whatsapp.gateway";
import { WhatsappService } from "./whatsapp.service";

class WhatsappLineDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;
}

@ApiTags("whatsapp")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/whatsapp")
export class WhatsappController {
  constructor(private readonly service: WhatsappService) {}

  @Get("status")
  status(@WorkspaceId() workspaceId: string) {
    return this.service.status(workspaceId);
  }

  @Get("groups")
  groups(@WorkspaceId() workspaceId: string) {
    return this.service.listGroups(workspaceId);
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

  /** Forget the stored pairing and show a fresh QR (the fix for "no me sale el QR"). */
  @Post("relink")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  relink(@WorkspaceId() workspaceId: string) {
    return this.service.relink(workspaceId);
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

  // ── Extra numbers (lines). Line 1 is the main number above. ──────────────
  @Get("lines")
  lines(@WorkspaceId() workspaceId: string) {
    return this.service.lines(workspaceId);
  }

  @Post("lines")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  addLine(@WorkspaceId() workspaceId: string, @Body() dto: WhatsappLineDto) {
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
    @Body() dto: WhatsappLineDto,
  ) {
    return this.service.renameLine(workspaceId, line, dto.label ?? null);
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
    if (action === "relink") return this.service.relink(workspaceId, line);
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

  /** Active checks for "the QR does not appear" — readable lines for the panel. */
  @Post("diagnose")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  diagnose(@WorkspaceId() workspaceId: string) {
    return this.service.diagnose(workspaceId);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappGateway],
  exports: [WhatsappService],
})
export class WhatsappModule {}
