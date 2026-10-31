import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { WORKSPACE_GOAL_IDS, WORKSPACE_KINDS, type Workspace, type WorkspaceKind } from "@nv/domain";
import { ConfigService } from "@nestjs/config";
import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { WorkspaceRegistry, cleanGoals } from "../../common/workspace-registry.service";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { resolveMediaDir, WORKSPACE_DIR_RE } from "../media/local-storage";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { WorkspaceAccessService, type TrialOrigin } from "../../common/access/workspace-access.service";
import type { AppConfig } from "../../config/configuration";

export class CreateWorkspaceDto {
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsOptional() @IsIn(WORKSPACE_KINDS) kind?: WorkspaceKind;
  @IsOptional() @IsString() accent?: string;
  @IsOptional() @IsString() @MaxLength(80) tagline?: string;
  @IsOptional() @IsArray() @IsIn(WORKSPACE_GOAL_IDS, { each: true }) goals?: string[];
}

export class UpdateWorkspaceDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsIn(WORKSPACE_KINDS) kind?: WorkspaceKind;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) accent?: string;
  @IsOptional() @IsString() @MaxLength(80) tagline?: string;
  @IsOptional() @IsArray() @IsIn(WORKSPACE_GOAL_IDS, { each: true }) goals?: string[];
}

export class DeleteWorkspaceDto {
  @IsString() confirmName!: string;
}

/**
 * The browser's device id and traits hash (sent by the panel as headers) and
 * its IP behind cPanel's proxy, to give one free trial per device.
 */
export function trialOrigin(req: Request): Omit<TrialOrigin, "userId"> {
  const header = (name: string) => {
    const v = req.headers[name];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const forwarded = header("x-forwarded-for")?.split(",")[0]?.trim();
  return { deviceId: header("x-nv-device"), fingerprint: header("x-nv-fp"), ip: forwarded || req.ip || null };
}

/**
 * Every table that holds a brand's rows, from Prisma's own model list: models
 * with a `workspaceSlug` (or `workspaceId`) column. Rows that hang off those
 * (targets, variables…) go with them through their foreign keys.
 */
export function workspaceTables(): { table: string; column: string }[] {
  const out: { table: string; column: string }[] = [];
  for (const m of Prisma.dmmf.datamodel.models) {
    const f = m.fields.find((x) => x.kind === "scalar" && (x.name === "workspaceSlug" || x.name === "workspaceId"));
    if (f && m.name !== "Workspace") out.push({ table: m.dbName ?? m.name, column: f.dbName ?? f.name });
  }
  return out;
}

/**
 * Workspaces = built-in config (branding + modules) + user-created DB rows.
 * The list is served merged; creation persists a DB workspace and makes the
 * creator its Owner.
 */
@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly registry: WorkspaceRegistry,
    private readonly access: WorkspaceAccessService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
  ) {}

  /** Only the workspaces the user belongs to (no cross-tenant enumeration). */
  listForUser(userId: string): Promise<Workspace[]> {
    return this.registry.listForUser(userId);
  }

  async get(slug: string): Promise<Workspace> {
    const ws = await this.registry.resolve(slug);
    if (!ws) throw new NotFoundException(`Workspace "${slug}" no encontrado`);
    const [withGoals] = await this.registry.withGoals([ws]);
    return withGoals!;
  }

  /**
   * Edit a brand. Goals work on every brand (they live in its settings);
   * name, type, color and tagline only on brands a customer created — the
   * built-in demo brands come from the app's config.
   */
  async update(slug: string, dto: UpdateWorkspaceDto, actor: string): Promise<Workspace> {
    const ws = await this.get(slug);
    const identity = dto.name !== undefined || dto.kind !== undefined || dto.accent !== undefined || dto.tagline !== undefined;
    if (identity) {
      if (ws.builtin) throw new BadRequestException("Esta marca de demostración no se puede renombrar.");
      await this.prisma.workspace.update({
        where: { slug },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.accent !== undefined ? { accent: dto.accent } : {}),
          ...(dto.tagline !== undefined ? { tagline: dto.tagline.trim() || null } : {}),
        },
      });
    }
    if (dto.goals !== undefined) {
      const goals = cleanGoals(dto.goals);
      await this.prisma.workspaceSettings.upsert({
        where: { workspaceSlug: slug },
        create: { workspaceSlug: slug, goals, updatedBy: actor },
        update: { goals, updatedBy: actor },
      });
    }
    await this.audit.record(slug, actor, "workspace.update", Object.keys(dto).join(","));
    return this.get(slug);
  }

  /**
   * Delete a brand a customer created, with all its data and uploaded files.
   * The caller must type the brand's exact name. Built-in brands can't be deleted.
   */
  async remove(slug: string, confirmName: string, actor: string): Promise<void> {
    const ws = await this.get(slug);
    if (ws.builtin) throw new BadRequestException("Las marcas de demostración no se pueden eliminar.");
    if (confirmName.trim() !== ws.name) throw new BadRequestException("Escribe el nombre exacto de la marca para confirmar.");
    // Several passes: a row another table still points to is retried once
    // the rows pointing to it are gone.
    let pending = workspaceTables();
    for (let pass = 0; pass < 6 && pending.length > 0; pass++) {
      const failed: typeof pending = [];
      for (const t of pending) {
        try {
          await this.prisma.$executeRawUnsafe(`DELETE FROM "${t.table}" WHERE "${t.column}" = $1`, slug);
        } catch {
          failed.push(t);
        }
      }
      pending = failed;
    }
    if (pending.length > 0) {
      this.logger.error(`No se pudo borrar todo de ${slug}: ${pending.map((t) => t.table).join(", ")}`);
      throw new BadRequestException("No se pudo eliminar la marca por completo. Intenta de nuevo.");
    }
    await this.prisma.workspace.delete({ where: { slug } });
    const media = this.config.get("media", { infer: true });
    if (media?.dir && WORKSPACE_DIR_RE.test(slug)) {
      await rm(join(resolveMediaDir(media.dir), slug), { recursive: true, force: true }).catch(() => undefined);
    }
    this.logger.log(`Marca ${slug} eliminada por ${actor}`);
  }

  /** A brand a customer creates starts its free trial; the operator's own brands don't. */
  async create(dto: CreateWorkspaceDto, user: AuthenticatedUser, origin?: Omit<TrialOrigin, "userId">): Promise<Workspace> {
    const operator = this.config.get("superAdmins", { infer: true }).includes(user.email.toLowerCase());
    if (!operator) await this.assertMayAddBrand(user.userId);
    const ws = await this.registry.create(dto, { userId: user.userId, email: user.email });
    if (dto.goals?.length) {
      const goals = cleanGoals(dto.goals);
      await this.prisma.workspaceSettings.upsert({
        where: { workspaceSlug: ws.slug },
        create: { workspaceSlug: ws.slug, goals, updatedBy: user.email },
        update: { goals },
      });
      ws.goals = goals;
    }
    if (!operator) await this.access.startTrial(ws.slug, { userId: user.userId, ...origin });
    return ws;
  }

  /** A brand on the Básico plan is its owner's only brand. */
  private async assertMayAddBrand(userId: string): Promise<void> {
    if (!this.prisma.enabled) return;
    const owned = await this.prisma.membership.findMany({ where: { userId, role: "Owner" }, select: { workspaceSlug: true } });
    for (const { workspaceSlug } of owned) {
      const limits = await this.access.limits(workspaceSlug);
      if (limits?.brands != null && owned.length >= limits.brands) {
        const name = (await this.registry.resolve(workspaceSlug))?.name ?? workspaceSlug;
        throw new HttpException(
          `Tu plan Básico incluye ${limits.brands} marca («${name}»). Mejora a Pro para crear otra.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }
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
  create(@Body() dto: CreateWorkspaceDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.service.create(dto, user, trialOrigin(req));
  }

  /** Membership-gated: only members can resolve a workspace by slug. */
  @UseGuards(WorkspaceGuard)
  @Get(":workspace")
  get(@Param("workspace") slug: string): Promise<Workspace> {
    return this.service.get(slug);
  }

  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles("Owner", "Admin")
  @Patch(":workspace")
  update(@Param("workspace") slug: string, @Body() dto: UpdateWorkspaceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(slug, dto, user.email);
  }

  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles("Owner")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete(":workspace")
  @HttpCode(204)
  remove(@Param("workspace") slug: string, @Body() dto: DeleteWorkspaceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(slug, dto.confirmName, user.email);
  }
}

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
