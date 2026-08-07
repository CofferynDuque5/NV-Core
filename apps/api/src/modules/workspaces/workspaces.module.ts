import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { WORKSPACE_KINDS, type Workspace, type WorkspaceKind } from "@nv/domain";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { WorkspaceRegistry } from "../../common/workspace-registry.service";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

export class CreateWorkspaceDto {
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsOptional() @IsIn(WORKSPACE_KINDS) kind?: WorkspaceKind;
  @IsOptional() @IsString() accent?: string;
  @IsOptional() @IsString() @MaxLength(80) tagline?: string;
}

/**
 * Workspaces = built-in config (branding + modules) + user-created DB rows.
 * The list is served merged; creation persists a DB workspace and makes the
 * creator its Owner.
 */
@Injectable()
export class WorkspacesService {
  constructor(private readonly registry: WorkspaceRegistry) {}

  /** Only the workspaces the user belongs to (no cross-tenant enumeration). */
  listForUser(userId: string): Promise<Workspace[]> {
    return this.registry.listForUser(userId);
  }

  async get(slug: string): Promise<Workspace> {
    const ws = await this.registry.resolve(slug);
    if (!ws) throw new NotFoundException(`Workspace "${slug}" no encontrado`);
    return ws;
  }

  create(dto: CreateWorkspaceDto, user: AuthenticatedUser): Promise<Workspace> {
    return this.registry.create(dto, { userId: user.userId, email: user.email });
  }
}

@ApiTags("workspaces")
@ApiBearerAuth()
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly service: WorkspacesService) {}

  /** Requires auth; returns only the caller's workspaces. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Workspace[]> {
    return this.service.listForUser(user.userId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateWorkspaceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  /** Membership-gated: only members can resolve a workspace by slug. */
  @UseGuards(WorkspaceGuard)
  @Get(":workspace")
  get(@Param("workspace") slug: string): Promise<Workspace> {
    return this.service.get(slug);
  }
}

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
