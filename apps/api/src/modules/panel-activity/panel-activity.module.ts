import { Body, Controller, HttpCode, Module, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { IsString, MaxLength, MinLength } from "class-validator";

import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AllowDemo } from "../../auth/decorators/allow-demo.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { PanelActivityService } from "./panel-activity.service";

export class PanelPingDto {
  @IsString() @MinLength(8) @MaxLength(40) sessionId!: string;
  @IsString() @MinLength(1) @MaxLength(300) path!: string;
}

@ApiTags("activity")
@ApiBearerAuth()
@Controller("activity")
export class PanelActivityController {
  constructor(private readonly activity: PanelActivityService) {}

  /** The panel is open on this page (also for the demo account). */
  @AllowDemo()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(204)
  @Post("ping")
  async ping(@Body() dto: PanelPingDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
    await this.activity.ping(user, dto.sessionId, dto.path, {
      ip: forwarded || req.ip || null,
      userAgent: String(req.headers["user-agent"] ?? "") || null,
    });
  }
}

@Module({
  controllers: [PanelActivityController],
  providers: [PanelActivityService],
  exports: [PanelActivityService],
})
export class PanelActivityModule {}
