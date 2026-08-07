import {
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { OnboardingStatus, OnboardingStep, OnboardingStepKey } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

const STEP_ORDER: OnboardingStepKey[] = ["connect", "audience", "content", "publish"];

/** All steps incomplete — the honest state when there is no DB configured. */
function emptyStatus(dismissed = false): OnboardingStatus {
  const steps: OnboardingStep[] = STEP_ORDER.map((key) => ({ key, done: false }));
  return { steps, completed: 0, total: steps.length, allDone: false, dismissed };
}

function buildStatus(
  done: Record<OnboardingStepKey, boolean>,
  dismissed: boolean,
): OnboardingStatus {
  const steps: OnboardingStep[] = STEP_ORDER.map((key) => ({ key, done: done[key] }));
  const completed = steps.filter((s) => s.done).length;
  return { steps, completed, total: steps.length, allDone: completed === steps.length, dismissed };
}

/**
 * Onboarding = a guided first-value checklist for a new workspace. Every step's
 * completion is derived from real workspace data (a connection exists, an
 * audience exists, content was drafted, a post was actually published), so the
 * progress is never faked. Only the user's dismissal choice is persisted.
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async status(workspaceId: string, userId: string): Promise<OnboardingStatus> {
    if (!this.prisma.enabled) return emptyStatus();

    const [connections, contacts, groups, posts, published, state] = await Promise.all([
      this.prisma.connection.count({ where: { workspaceSlug: workspaceId } }),
      this.prisma.contact.count({ where: { workspaceSlug: workspaceId } }),
      this.prisma.group.count({ where: { workspaceSlug: workspaceId } }),
      this.prisma.post.count({ where: { workspaceSlug: workspaceId } }),
      this.prisma.post.count({ where: { workspaceSlug: workspaceId, status: "sent" } }),
      this.prisma.onboardingState.findUnique({
        where: { workspaceSlug_userId: { workspaceSlug: workspaceId, userId } },
      }),
    ]);

    return buildStatus(
      {
        connect: connections > 0,
        audience: contacts > 0 || groups > 0,
        content: posts > 0,
        publish: published > 0,
      },
      state?.dismissedAt != null,
    );
  }

  async dismiss(workspaceId: string, userId: string): Promise<OnboardingStatus> {
    if (this.prisma.enabled) {
      await this.prisma.onboardingState.upsert({
        where: { workspaceSlug_userId: { workspaceSlug: workspaceId, userId } },
        create: { workspaceSlug: workspaceId, userId, dismissedAt: new Date() },
        update: { dismissedAt: new Date() },
      });
    }
    return this.status(workspaceId, userId);
  }
}

@ApiTags("onboarding")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/onboarding")
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get()
  status(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.status(workspaceId, user.userId);
  }

  @Post("dismiss")
  @HttpCode(200)
  dismiss(@WorkspaceId() workspaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.dismiss(workspaceId, user.userId);
  }
}

@Module({ controllers: [OnboardingController], providers: [OnboardingService] })
export class OnboardingModule {}
