import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { InviteLinkPreview } from "@nv/domain";

import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import type { AuthenticatedUser } from "./auth.types";
import { InviteLinksService } from "./invite-links.service";

/** The /join/:token page: see who invites you, then join (signed in). */
@ApiTags("auth")
@Controller("auth/invite-links")
export class InviteLinksController {
  constructor(private readonly links: InviteLinksService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(":token")
  preview(@Param("token") token: string): Promise<InviteLinkPreview> {
    return this.links.preview(token);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post(":token/accept")
  accept(@Param("token") token: string, @CurrentUser() user: AuthenticatedUser) {
    return this.links.accept(token, user.userId);
  }
}
