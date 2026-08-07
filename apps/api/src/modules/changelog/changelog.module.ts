import { Controller, Get, HttpCode, Injectable, Module, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CHANGELOG_ENTRIES, type ChangelogStatus } from "@nv/domain";

import { PrismaService } from "../../prisma/prisma.service";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

/** Count entries newer than the given last-seen time (null = all unseen). */
function unseenSince(lastSeenAt: Date | null): number {
  if (!lastSeenAt) return CHANGELOG_ENTRIES.length;
  return CHANGELOG_ENTRIES.filter((e) => new Date(e.date).getTime() > lastSeenAt.getTime()).length;
}

/**
 * Changelog state is per user and product-wide (not workspace scoped). The
 * entries themselves are static config; only each user's "last seen" time is
 * persisted, which drives the unseen badge.
 */
@Injectable()
export class ChangelogService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string): Promise<ChangelogStatus> {
    if (!this.prisma.enabled) {
      return { lastSeenAt: null, unseenCount: CHANGELOG_ENTRIES.length };
    }
    const row = await this.prisma.changelogState.findUnique({ where: { userId } });
    const lastSeenAt = row?.lastSeenAt ?? null;
    return { lastSeenAt: lastSeenAt?.toISOString() ?? null, unseenCount: unseenSince(lastSeenAt) };
  }

  async markSeen(userId: string): Promise<ChangelogStatus> {
    if (!this.prisma.enabled) return { lastSeenAt: null, unseenCount: 0 };
    const now = new Date();
    await this.prisma.changelogState.upsert({
      where: { userId },
      create: { userId, lastSeenAt: now },
      update: { lastSeenAt: now },
    });
    return { lastSeenAt: now.toISOString(), unseenCount: 0 };
  }
}

@ApiTags("changelog")
@ApiBearerAuth()
@Controller("me/changelog")
export class ChangelogController {
  constructor(private readonly service: ChangelogService) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.service.status(user.userId);
  }

  @Post("seen")
  @HttpCode(200)
  markSeen(@CurrentUser() user: AuthenticatedUser) {
    return this.service.markSeen(user.userId);
  }
}

@Module({ controllers: [ChangelogController], providers: [ChangelogService] })
export class ChangelogModule {}
