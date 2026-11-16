import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  CHANNEL_IDS,
  GROUP_CATEGORY_IDS,
  GROUP_COUNTRY_IDS,
  SEND_CONFIRM_MODES,
  analyzeGroupRules,
  groupPostingProblems,
  type ChannelId,
  type Group,
  type GroupRulesCheck,
  type SendConfirmMode,
  type SendSettings,
} from "@nv/domain";
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength, ValidateIf } from "class-validator";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

import { ListResultDto } from "../../common/dto/list-result.dto";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { AuditLogger } from "../../common/audit-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mapGroup } from "../../prisma/mappers";
import { Prisma } from "@prisma/client";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { WhatsappService } from "../whatsapp/whatsapp.service";

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ enum: CHANNEL_IDS })
  @IsOptional()
  @IsIn(CHANNEL_IDS)
  channel?: ChannelId;

  @ApiPropertyOptional({ enum: ["group", "channel"] })
  @IsOptional()
  @IsIn(["group", "channel"])
  kind?: "group" | "channel";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  members?: number;

  @ApiPropertyOptional({ description: "Telegram chat_id o JID de WhatsApp" })
  @IsOptional()
  @IsString()
  remoteJid?: string;
}

export class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsIn(CHANNEL_IDS) channel?: ChannelId;
  @IsOptional() @IsIn(["group", "channel"]) kind?: "group" | "channel";
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsInt() @Min(0) members?: number;
  // Where campaigns may go (see groupPostingProblems in @nv/domain).
  @IsOptional() @IsBoolean() excluded?: boolean;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(GROUP_CATEGORY_IDS) category?: string | null;
  @IsOptional() @IsBoolean() requiresPrice?: boolean;
  @IsOptional() @IsBoolean() requiresImage?: boolean;
  @IsOptional() @IsBoolean() forbidsAds?: boolean;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(GROUP_COUNTRY_IDS) country?: string | null;
  // Own sending hours (both or none) and daily limit; null = the brand's.
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(HHMM, { message: "La hora debe ser HH:MM." }) sendFrom?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(HHMM, { message: "La hora debe ser HH:MM." }) sendUntil?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(50) maxPerDay?: number | null;
}

export class SendSettingsDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(HHMM, { message: "La hora debe ser HH:MM." }) sendFrom?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(HHMM, { message: "La hora debe ser HH:MM." }) sendUntil?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(50) groupMaxPerDay?: number | null;
  @IsOptional() @IsIn([...SEND_CONFIRM_MODES]) sendConfirm?: SendConfirmMode;
  @IsOptional() @IsInt() @Min(5) @Max(120) sendConfirmLeadMin?: number;
}

/** Both ends of a window, or neither. */
function pairHours(from: string | null | undefined, until: string | null | undefined): void {
  const a = from === undefined ? undefined : from || null;
  const b = until === undefined ? undefined : until || null;
  if (a === undefined && b === undefined) return;
  if (!!a !== !!b) throw new BadRequestException("Indica las dos horas (desde y hasta) o ninguna.");
}

/** Keep (or bring back) several groups at once. */
export class BulkExcludeDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
  @IsBoolean() excluded!: boolean;
}

/** Accounts in many groups (resellers) easily pass the generic 500 cap. */
const GROUP_LIST_CAP = 5000;

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogger,
    private readonly whatsapp: WhatsappService,
  ) {}

  private db() {
    if (!this.prisma.enabled) throw new ServiceUnavailableException("Base de datos no configurada.");
    return this.prisma;
  }

  async list(workspaceId: string): Promise<ListResultDto<Group>> {
    if (!this.prisma.enabled) return ListResultDto.empty<Group>();
    const where = { workspaceSlug: workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.group.findMany({ where, orderBy: { createdAt: "desc" }, take: GROUP_LIST_CAP }),
      this.prisma.group.count({ where }),
    ]);
    const last = await this.lastSends(workspaceId);
    return new ListResultDto(
      rows.map((r) => {
        const s = last.get(r.id);
        return { ...mapGroup(r), lastSentAt: s ? s.at.toISOString() : null, lastSendOk: s ? s.ok : null };
      }),
      total,
    );
  }

  /** Latest campaign send per group (one row per group, from the send log). */
  private async lastSends(workspaceId: string): Promise<Map<string, { at: Date; ok: boolean }>> {
    const rows = await this.prisma.$queryRaw<{ groupId: string; at: Date; ok: boolean }[]>(Prisma.sql`
      SELECT DISTINCT ON ("groupId") "groupId", "createdAt" AS at, ok
      FROM "SendLog"
      WHERE "workspaceSlug" = ${workspaceId} AND "groupId" IS NOT NULL
      ORDER BY "groupId", "createdAt" DESC
    `);
    return new Map(rows.map((r) => [r.groupId, { at: new Date(r.at), ok: r.ok }]));
  }

  async create(workspaceId: string, actor: string, dto: CreateGroupDto): Promise<Group> {
    const row = await this.db().group.create({
      data: {
        workspaceSlug: workspaceId,
        name: dto.name,
        channel: dto.channel ?? "wa",
        kind: dto.kind ?? "group",
        description: dto.description,
        tags: dto.tags ?? [],
        members: dto.members ?? 0,
        remoteJid: dto.remoteJid?.trim() || null,
      },
    });
    await this.audit.record(workspaceId, actor, "group.create", row.id);
    return mapGroup(row);
  }

  async update(workspaceId: string, actor: string, id: string, dto: UpdateGroupDto): Promise<Group> {
    const existing = await this.db().group.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!existing) throw new NotFoundException("Grupo no encontrado.");
    if (dto.sendFrom !== undefined || dto.sendUntil !== undefined) {
      pairHours(dto.sendFrom ?? (dto.sendFrom === undefined ? existing.sendFrom : null), dto.sendUntil ?? (dto.sendUntil === undefined ? existing.sendUntil : null));
    }
    const row = await this.prisma.group.update({ where: { id }, data: dto });
    await this.audit.record(workspaceId, actor, "group.update", id);
    return mapGroup(row);
  }

  /** Brand sending hours for campaigns and default daily limit per group. */
  async sendSettings(workspaceId: string): Promise<SendSettings> {
    if (!this.prisma.enabled)
      return { sendFrom: null, sendUntil: null, groupMaxPerDay: null, sendConfirm: "notify", sendConfirmLeadMin: 15 };
    const row = await this.prisma.workspaceSettings.findUnique({
      where: { workspaceSlug: workspaceId },
      select: { sendFrom: true, sendUntil: true, groupMaxPerDay: true, sendConfirm: true, sendConfirmLeadMin: true },
    });
    return {
      sendFrom: row?.sendFrom ?? null,
      sendUntil: row?.sendUntil ?? null,
      groupMaxPerDay: row?.groupMaxPerDay ?? null,
      sendConfirm: (row?.sendConfirm as SendConfirmMode | undefined) ?? "notify",
      sendConfirmLeadMin: row?.sendConfirmLeadMin ?? 15,
    };
  }

  async saveSendSettings(workspaceId: string, actor: string, dto: SendSettingsDto): Promise<SendSettings> {
    const data = {
      sendFrom: dto.sendFrom || null,
      sendUntil: dto.sendUntil || null,
      groupMaxPerDay: dto.groupMaxPerDay ?? null,
      ...(dto.sendConfirm ? { sendConfirm: dto.sendConfirm } : {}),
      ...(dto.sendConfirmLeadMin ? { sendConfirmLeadMin: dto.sendConfirmLeadMin } : {}),
    };
    pairHours(data.sendFrom, data.sendUntil);
    await this.db().workspaceSettings.upsert({
      where: { workspaceSlug: workspaceId },
      create: { workspaceSlug: workspaceId, ...data },
      update: data,
    });
    await this.audit.record(workspaceId, actor, "groups.send_settings", `${data.sendFrom ?? "-"}-${data.sendUntil ?? "-"} max ${data.groupMaxPerDay ?? "-"}`);
    return this.sendSettings(workspaceId);
  }

  async remove(workspaceId: string, actor: string, id: string): Promise<void> {
    const { count } = await this.db().group.deleteMany({ where: { id, workspaceSlug: workspaceId } });
    if (count === 0) throw new NotFoundException("Grupo no encontrado.");
    await this.audit.record(workspaceId, actor, "group.delete", id);
  }

  /**
   * Delete every AUTO-SYNCED group (imported from WhatsApp/Telegram) for this
   * workspace — the cleanup for "there are groups here I never added". Manually
   * created groups (synced=false) are kept. Cascades to their campaign targets.
   */
  async clearSynced(
    workspaceId: string,
    actor: string,
    channel?: "wa" | "tg",
  ): Promise<{ deleted: number }> {
    const where = { workspaceSlug: workspaceId, synced: true, ...(channel ? { channel } : {}) };
    const { count } = await this.db().group.deleteMany({ where });
    await this.audit.record(workspaceId, actor, "group.clearSynced", String(count));
    return { deleted: count };
  }

  async bulkExclude(workspaceId: string, actor: string, dto: BulkExcludeDto): Promise<{ updated: number }> {
    const { count } = await this.db().group.updateMany({
      where: { workspaceSlug: workspaceId, id: { in: dto.ids } },
      data: { excluded: dto.excluded },
    });
    await this.audit.record(workspaceId, actor, dto.excluded ? "group.exclude" : "group.include", String(count));
    return { updated: count };
  }

  /**
   * Read the rules of the brand's groups (one, or all): with WhatsApp
   * connected the description and the admins-only setting are fetched again
   * first; otherwise the saved description is used. Requirements found are
   * switched on (never off), and each group says whether campaigns can post.
   */
  async checkRules(workspaceId: string, id?: string): Promise<GroupRulesCheck[]> {
    let source: GroupRulesCheck["source"] = "guardado";
    if (this.whatsapp.isConnected(workspaceId)) {
      await this.whatsapp.sync(workspaceId);
      source = "whatsapp";
    }
    const where = { workspaceSlug: workspaceId, ...(id ? { id } : {}) };
    const groups = await this.db().group.findMany({ where, orderBy: { name: "asc" }, take: GROUP_LIST_CAP });
    if (id && groups.length === 0) throw new NotFoundException("Grupo no encontrado.");
    const out: GroupRulesCheck[] = [];
    for (const g of groups) {
      const a = analyzeGroupRules(g.description, g.onlyAdmins);
      const row = await this.prisma.group.update({
        where: { id: g.id },
        data: {
          rulesCheckedAt: new Date(),
          ...(a.forbidsAds ? { forbidsAds: true } : {}),
          ...(a.requiresPrice ? { requiresPrice: true } : {}),
          ...(a.requiresImage ? { requiresImage: true } : {}),
        },
      });
      const group = mapGroup(row);
      // Can a sales post go here at all (price/photo are checked per campaign)?
      const blocking = groupPostingProblems({ ...group, requiresPrice: false, requiresImage: false }, { hasImage: true });
      // The rules' own findings already say «solo admins» / «prohíben publicidad».
      const extra = blocking.filter(
        (b) => !(a.onlyAdmins && b.startsWith("Solo los administradores")) && !(a.forbidsAds && b.startsWith("Sus reglas")),
      );
      out.push({ group, notes: [...extra, ...a.notes], source, canPost: blocking.length === 0 });
    }
    return out;
  }

  /** Per-group merge variables as a flat { key: value } map. */
  async getVars(workspaceId: string, id: string): Promise<Record<string, string>> {
    const group = await this.db().group.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!group) throw new NotFoundException("Grupo no encontrado.");
    const rows = await this.prisma.groupVariable.findMany({ where: { groupId: id } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /** Replace the whole set of variables for a group. */
  async setVars(
    workspaceId: string,
    id: string,
    vars: Record<string, string>,
  ): Promise<Record<string, string>> {
    const group = await this.db().group.findFirst({ where: { id, workspaceSlug: workspaceId } });
    if (!group) throw new NotFoundException("Grupo no encontrado.");
    const entries = Object.entries(vars ?? {}).filter(([k]) => k.trim());
    await this.prisma.$transaction([
      this.prisma.groupVariable.deleteMany({ where: { groupId: id } }),
      ...(entries.length
        ? [
            this.prisma.groupVariable.createMany({
              data: entries.map(([key, value]) => ({
                workspaceSlug: workspaceId,
                groupId: id,
                key: key.trim(),
                value: String(value ?? ""),
              })),
            }),
          ]
        : []),
    ]);
    return Object.fromEntries(entries.map(([k, v]) => [k.trim(), String(v ?? "")]));
  }
}

@ApiTags("groups")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/groups")
export class GroupsController {
  constructor(private readonly service: GroupsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.service.list(workspaceId);
  }

  @Get("send-settings")
  sendSettings(@WorkspaceId() workspaceId: string) {
    return this.service.sendSettings(workspaceId);
  }

  @Put("send-settings")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  saveSendSettings(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendSettingsDto,
  ) {
    return this.service.saveSendSettings(workspaceId, user.email, dto);
  }

  @Get(":id/vars")
  getVars(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return this.service.getVars(workspaceId, id);
  }

  @Put(":id/vars")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  setVars(
    @WorkspaceId() workspaceId: string,
    @Param("id") id: string,
    @Body() vars: Record<string, string>,
  ) {
    return this.service.setVars(workspaceId, id, vars);
  }

  @Post()
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGroupDto,
  ) {
    return this.service.create(workspaceId, user.email, dto);
  }

  @Patch(":id")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  update(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.service.update(workspaceId, user.email, id, dto);
  }

  // Static paths BEFORE `:id` so they aren't captured as an id.
  @Post("check-rules")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  checkAllRules(@WorkspaceId() workspaceId: string) {
    return this.service.checkRules(workspaceId);
  }

  @Post("exclude")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  bulkExclude(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkExcludeDto,
  ) {
    return this.service.bulkExclude(workspaceId, user.email, dto);
  }

  @Post(":id/check-rules")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  async checkRules(@WorkspaceId() workspaceId: string, @Param("id") id: string) {
    return (await this.service.checkRules(workspaceId, id))[0];
  }

  // Clears auto-synced
  // (imported) groups; optional ?channel=wa|tg narrows it.
  @Post("clear-synced")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  clearSynced(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("channel") channel?: string,
  ) {
    const ch = channel === "wa" || channel === "tg" ? channel : undefined;
    return this.service.clearSynced(workspaceId, user.email, ch);
  }

  @Delete(":id")
  @Roles("Owner", "Admin")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  remove(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(workspaceId, user.email, id);
  }
}

@Module({ imports: [WhatsappModule], controllers: [GroupsController], providers: [GroupsService] })
export class GroupsModule {}
