import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ROLES, type Role } from "@nv/domain";
import { IsIn, IsInt, IsString, Max, Min, MinLength } from "class-validator";

import { AuthModule } from "../../auth/auth.module";
import { AuthStore } from "../../auth/auth.store";
import { SuperAdminGuard } from "../../auth/guards/super-admin.guard";
import { WorkspaceRegistry } from "../../common/workspace-registry.service";
import { WorkspaceAccessService } from "../../common/access/workspace-access.service";
import { AuditLogger } from "../../common/audit-logger.service";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";

export class SetMembershipDto {
  @IsString() @MinLength(3) email!: string;
  @IsString() @MinLength(1) workspaceSlug!: string;
  @IsIn(ROLES) role!: Role;
}

export class ActivateAccessDto {
  @IsInt() @Min(1) @Max(400) days!: number;
}

export interface AdminUserView {
  id: string;
  email: string;
  name: string;
  memberships: { workspaceSlug: string; role: Role }[];
}

@Injectable()
export class AdminService {
  constructor(
    private readonly store: AuthStore,
    private readonly registry: WorkspaceRegistry,
    private readonly access: WorkspaceAccessService,
    private readonly audit: AuditLogger,
  ) {}

  /** Trials and paid brands, for the operator. */
  accessList() {
    return this.access.list();
  }

  /** Add paid days to a brand after confirming its payment. */
  async activate(slug: string, days: number, actor: string) {
    if (!(await this.registry.exists(slug))) throw new NotFoundException(`Workspace "${slug}" no existe.`);
    const state = await this.access.activate(slug, days, actor);
    await this.audit.record(slug, actor, "access.activate", `+${days} días · hasta ${state.paidUntil}`);
    return state;
  }

  async users(): Promise<AdminUserView[]> {
    const rows = await this.store.listAllUsers();
    return rows.map(({ user, memberships }) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      memberships,
    }));
  }

  async workspaces() {
    return this.registry.listAll();
  }

  /** Assign (or change) a user's role in any workspace. */
  async setMembership(dto: SetMembershipDto): Promise<{ ok: true }> {
    const user = await this.store.findUserByEmail(dto.email.toLowerCase().trim());
    if (!user) throw new NotFoundException(`Usuario "${dto.email}" no encontrado.`);
    if (!(await this.registry.exists(dto.workspaceSlug))) {
      throw new NotFoundException(`Workspace "${dto.workspaceSlug}" no existe.`);
    }
    await this.store.upsertMembership(user.id, dto.workspaceSlug, dto.role);
    return { ok: true };
  }

  async removeMembership(userId: string, workspaceSlug: string): Promise<void> {
    await this.store.removeMembership(userId, workspaceSlug);
  }
}

/**
 * Platform super-admin API: control every user and their roles across all
 * workspaces. Guarded by the global auth guard + SuperAdminGuard (emails in
 * NV_SUPER_ADMINS / NV_ADMIN_EMAIL).
 */
@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get("users")
  users() {
    return this.service.users();
  }

  @Get("workspaces")
  workspaces() {
    return this.service.workspaces();
  }

  @Post("memberships")
  @HttpCode(200)
  setMembership(@Body() dto: SetMembershipDto) {
    return this.service.setMembership(dto);
  }

  @Get("access")
  accessList() {
    return this.service.accessList();
  }

  @Post("access/:workspaceSlug/activate")
  @HttpCode(200)
  activate(
    @Param("workspaceSlug") slug: string,
    @Body() dto: ActivateAccessDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.activate(slug, dto.days, user.email);
  }

  @Delete("memberships/:userId/:workspaceSlug")
  @HttpCode(204)
  removeMembership(
    @Param("userId") userId: string,
    @Param("workspaceSlug") workspaceSlug: string,
  ) {
    return this.service.removeMembership(userId, workspaceSlug);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, SuperAdminGuard],
})
export class AdminModule {}
