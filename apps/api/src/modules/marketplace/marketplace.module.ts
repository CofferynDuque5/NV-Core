import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MARKETPLACE_APPS, getMarketplaceApp, type MarketplaceEntry } from "@nv/domain";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  /** The full catalog with this workspace's install state merged in. */
  async catalog(workspaceId: string): Promise<MarketplaceEntry[]> {
    const installs = this.prisma.enabled
      ? await this.prisma.appInstallation.findMany({ where: { workspaceSlug: workspaceId } })
      : [];
    const byId = new Map(installs.map((i) => [i.appId, i.createdAt] as const));
    return MARKETPLACE_APPS.map((app) => ({
      ...app,
      installed: byId.has(app.id),
      installedAt: byId.get(app.id)?.toISOString(),
    }));
  }

  async install(workspaceId: string, actor: string, appId: string): Promise<MarketplaceEntry> {
    const app = getMarketplaceApp(appId);
    if (!app) throw new NotFoundException("App no encontrada en el catálogo.");
    const row = await this.db().appInstallation.upsert({
      where: { workspaceSlug_appId: { workspaceSlug: workspaceId, appId } },
      create: { workspaceSlug: workspaceId, appId },
      update: {},
    });
    await this.audit.record(workspaceId, actor, "app.install", appId);
    return { ...app, installed: true, installedAt: row.createdAt.toISOString() };
  }

  async uninstall(workspaceId: string, actor: string, appId: string): Promise<void> {
    await this.db().appInstallation.deleteMany({ where: { workspaceSlug: workspaceId, appId } });
    await this.audit.record(workspaceId, actor, "app.uninstall", appId);
  }
}

@ApiTags("marketplace")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/marketplace")
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  @Get()
  catalog(@WorkspaceId() workspaceId: string) {
    return this.service.catalog(workspaceId);
  }

  @Post(":appId/install")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  install(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("appId") appId: string,
  ) {
    return this.service.install(workspaceId, user.email, appId);
  }

  @Delete(":appId/install")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  uninstall(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("appId") appId: string,
  ) {
    return this.service.uninstall(workspaceId, user.email, appId);
  }
}

@Module({ controllers: [MarketplaceController], providers: [MarketplaceService] })
export class MarketplaceModule {}
