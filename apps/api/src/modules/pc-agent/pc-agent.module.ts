import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { PcAgentStatus } from "@nv/domain";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import type { MediaAttachment, PublishInput } from "../../providers/provider.types";

/**
 * "NV Agente PC" — the companion that runs on the operator's own computer and
 * publishes to Facebook / Instagram through a real browser logged in with their
 * own account (no Meta app, no third-party API). Shared hosting cannot run a
 * browser, so the panel only QUEUES the posts; the agent polls this module,
 * claims what is due, publishes, and reports back.
 *
 * Queue = `Post` rows on the fb/ig channels: `scheduled` (waiting) →
 * `publishing` (claimed by the agent) → `sent` | `error`.
 */

/** Agent considered offline after this long without a heartbeat. */
const ONLINE_WINDOW_MS = 3 * 60_000;
/** A claim older than this is assumed dead (agent closed mid-post) and re-queued. */
const STALE_CLAIM_MS = 30 * 60_000;
const CHANNELS = ["fb", "ig"] as const;

interface Heartbeat {
  lastSeenAt: string;
  hostname: string | null;
  facebook: boolean;
  instagram: boolean;
}

export class HeartbeatDto {
  @IsOptional() @IsString() @MaxLength(120) hostname?: string;
  @IsBoolean() facebook!: boolean;
  @IsBoolean() instagram!: boolean;
}

export class ResultDto {
  @IsString() postId!: string;
  @IsBoolean() ok!: boolean;
  @IsOptional() @IsString() @MaxLength(1000) error?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
}

export class EnqueueDto {
  @IsIn(["facebook", "instagram"]) target!: "facebook" | "instagram";
  @IsOptional() @IsString() @MaxLength(5000) message?: string;
}

export interface QueuedPost {
  id: string;
  channel: "fb" | "ig";
  target: "facebook" | "instagram";
  title: string;
  copy: string;
  hashtags: string[];
  attachments: MediaAttachment[];
  scheduledAt: string | null;
}

@Injectable()
export class PcAgentService {
  private readonly logger = new Logger(PcAgentService.name);

  constructor(private readonly prisma: PrismaService) {}

  private dir(): string {
    const dir = resolve(process.env.PC_AGENT_DIR ?? "data/pc-agent");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  private file(workspaceSlug: string): string {
    return join(this.dir(), `${workspaceSlug.replace(/[^a-z0-9_-]/gi, "")}.json`);
  }

  private read(workspaceSlug: string): Heartbeat | null {
    try {
      const f = this.file(workspaceSlug);
      return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Heartbeat) : null;
    } catch {
      return null;
    }
  }

  /** The agent pings every minute with which sessions it holds. */
  heartbeat(workspaceSlug: string, dto: HeartbeatDto): Heartbeat {
    const hb: Heartbeat = {
      lastSeenAt: new Date().toISOString(),
      hostname: dto.hostname ?? null,
      facebook: Boolean(dto.facebook),
      instagram: Boolean(dto.instagram),
    };
    try {
      writeFileSync(this.file(workspaceSlug), JSON.stringify(hb), "utf8");
    } catch (err) {
      this.logger.warn(`No se pudo guardar el latido del agente: ${(err as Error).message}`);
    }
    return hb;
  }

  /** Online + which networks are logged in (no DB needed). */
  presence(workspaceSlug: string): Omit<PcAgentStatus, "pending"> {
    const hb = this.read(workspaceSlug);
    const online = Boolean(hb && Date.now() - new Date(hb.lastSeenAt).getTime() < ONLINE_WINDOW_MS);
    return {
      online,
      lastSeenAt: hb?.lastSeenAt ?? null,
      hostname: hb?.hostname ?? null,
      facebook: online && Boolean(hb?.facebook),
      instagram: online && Boolean(hb?.instagram),
    };
  }

  async status(workspaceSlug: string): Promise<PcAgentStatus> {
    const pending = this.prisma.enabled
      ? await this.prisma.post.count({
          where: { workspaceSlug, channel: { in: [...CHANNELS] }, status: { in: ["scheduled", "publishing"] } },
        })
      : 0;
    return { ...this.presence(workspaceSlug), pending };
  }

  /** Queue an immediate publish (used by the provider adapter: "Publicar ahora", campañas). */
  async enqueue(workspaceSlug: string, target: "facebook" | "instagram", input: PublishInput): Promise<string> {
    if (!this.prisma.enabled) throw new Error("Base de datos no configurada.");
    const message = (input.message ?? "").trim();
    const row = await this.prisma.post.create({
      data: {
        workspaceSlug,
        channel: target === "facebook" ? "fb" : "ig",
        title: message.split("\n")[0]?.slice(0, 80) || "Publicación",
        copy: message,
        attachments: (input.attachments ?? []) as object[],
        status: "scheduled",
        scheduledAt: new Date(),
      },
    });
    return row.id;
  }

  /**
   * Hand the agent everything that is due, marking each row `publishing`
   * atomically so two agent loops never publish the same post twice.
   */
  async claim(workspaceSlug: string, limit = 5): Promise<QueuedPost[]> {
    if (!this.prisma.enabled) return [];
    const now = new Date();
    // Re-queue claims abandoned by a closed agent.
    await this.prisma.post.updateMany({
      where: {
        workspaceSlug,
        channel: { in: [...CHANNELS] },
        status: "publishing",
        scheduledAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) },
      },
      data: { status: "scheduled" },
    });
    const due = await this.prisma.post.findMany({
      where: {
        workspaceSlug,
        channel: { in: [...CHANNELS] },
        status: "scheduled",
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      orderBy: { scheduledAt: "asc" },
      take: limit,
    });
    const out: QueuedPost[] = [];
    for (const p of due) {
      const r = await this.prisma.post.updateMany({
        where: { id: p.id, status: "scheduled" },
        data: { status: "publishing", scheduledAt: now },
      });
      if (r.count !== 1) continue; // someone else took it
      const channel = p.channel as "fb" | "ig";
      out.push({
        id: p.id,
        channel,
        target: channel === "fb" ? "facebook" : "instagram",
        title: p.title,
        copy: p.copy ?? "",
        hashtags: p.hashtags,
        attachments: ((p.attachments as MediaAttachment[] | null) ?? []).filter((a) => a?.url),
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
      });
    }
    return out;
  }

  /** The agent reports the outcome; the panel's Historial + notifications reflect it. */
  async result(workspaceSlug: string, dto: ResultDto): Promise<{ ok: boolean }> {
    if (!this.prisma.enabled) return { ok: false };
    const post = await this.prisma.post.findFirst({ where: { id: dto.postId, workspaceSlug } });
    if (!post) return { ok: false };
    await this.prisma.post.update({
      where: { id: post.id },
      data: { status: dto.ok ? "sent" : "error" },
    });
    const target = post.channel === "fb" ? "facebook" : "instagram";
    await this.prisma.sendLog.create({
      data: {
        workspaceSlug,
        campaignId: post.campaignId ?? null,
        campaignName: post.campaignId ? undefined : "Agente PC",
        groupName: target === "facebook" ? "Facebook" : "Instagram",
        target,
        postId: dto.url ?? null,
        format: "feed",
        preview: (post.copy ?? post.title).slice(0, 140),
        ok: dto.ok,
        error: dto.ok ? null : (dto.error ?? "Error desconocido"),
      },
    });
    await this.prisma.notification.create({
      data: {
        workspaceSlug,
        type: dto.ok ? "success" : "error",
        title: dto.ok
          ? `Publicado en ${target === "facebook" ? "Facebook" : "Instagram"}: ${post.title}`
          : `Falló en ${target === "facebook" ? "Facebook" : "Instagram"}: ${post.title}`,
        meta: dto.ok ? (dto.url ?? undefined) : (dto.error ?? undefined)?.slice(0, 200),
      },
    });
    this.logger.log(`Agente PC · ${target} · ${post.id} → ${dto.ok ? "ok" : `error: ${dto.error}`}`);
    return { ok: true };
  }
}

@ApiTags("pc-agent")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/pc-agent")
export class PcAgentController {
  constructor(private readonly service: PcAgentService) {}

  @Get("status")
  status(@WorkspaceId() workspaceId: string) {
    return this.service.status(workspaceId);
  }

  @Post("heartbeat")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  heartbeat(@WorkspaceId() workspaceId: string, @Body() dto: HeartbeatDto) {
    return this.service.heartbeat(workspaceId, dto);
  }

  @Get("queue")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  queue(@WorkspaceId() workspaceId: string, @Query("limit") limit?: string) {
    const n = Math.min(10, Math.max(1, Number(limit) || 5));
    return this.service.claim(workspaceId, n);
  }

  @Post("result")
  @Roles("Owner", "Admin", "Editor")
  @UseGuards(RolesGuard)
  @HttpCode(200)
  result(@WorkspaceId() workspaceId: string, @Body() dto: ResultDto) {
    return this.service.result(workspaceId, dto);
  }
}

@Module({
  controllers: [PcAgentController],
  providers: [PcAgentService],
  exports: [PcAgentService],
})
export class PcAgentModule {}
