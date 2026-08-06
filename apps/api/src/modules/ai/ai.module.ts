import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AiRecommendation, AiVariant, BestTimes } from "@nv/domain";
import { IsOptional, IsString, MinLength } from "class-validator";

import type { AppConfig } from "../../config/configuration";
import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";
import { PlanGuard } from "../../common/guards/plan.guard";
import { RequiresActivePlan } from "../../common/decorators/requires-plan.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { createProvider, type AiProvider, type ChatMessage } from "./ai.providers";
import { estimateTokens, usagePeriod } from "./ai.usage";

export class GenerateVariantsDto {
  @IsString() @MinLength(3) prompt!: string;
  @IsString() channel!: string;
  @IsString() tone!: string;

  /** Content type (caption / anuncio / email / bio / hilo). Optional. */
  @IsOptional() @IsString() format?: string;
  /** Desired length (corto / medio / largo). Optional. */
  @IsOptional() @IsString() length?: string;
}

export class SuggestHashtagsDto {
  @IsString() @MinLength(3) prompt!: string;
}

export class ImproveMessageDto {
  @IsString() @MinLength(2) message!: string;
}

/** Extracts the first JSON array/object from a model response (tolerates prose/fences). */
export function extractJson<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const open = candidate[start];
  const close = open === "[" ? "]" : "}";
  const end = candidate.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export interface AiUsageView {
  period: string;
  calls: number;
  tokens: number;
  quota: number | null;
}

@Injectable()
export class AiService {
  private readonly provider: AiProvider | null;
  private readonly monthlyQuota?: number;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    const ai = config.get("integrations", { infer: true }).ai;
    this.provider = createProvider(ai);
    this.monthlyQuota = ai.monthlyQuota && ai.monthlyQuota > 0 ? ai.monthlyQuota : undefined;
  }

  private require(): AiProvider {
    if (!this.provider) {
      throw new ServiceUnavailableException(
        "Proveedor de IA no configurado. Define OPENAI_API_KEY, ANTHROPIC_API_KEY o GEMINI_API_KEY.",
      );
    }
    return this.provider;
  }

  /** Reject the call when the workspace has hit its monthly AI quota. */
  private async assertWithinQuota(workspaceId: string): Promise<void> {
    if (!this.monthlyQuota || !this.prisma.enabled) return;
    const row = await this.prisma.aiUsage.findUnique({
      where: { workspaceSlug_period: { workspaceSlug: workspaceId, period: usagePeriod(new Date()) } },
    });
    if ((row?.calls ?? 0) >= this.monthlyQuota) {
      throw new HttpException(
        `Alcanzaste el límite mensual de IA (${this.monthlyQuota}). Vuelve el próximo mes o amplía tu plan.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Increment usage counters for the workspace's current period. */
  private async record(workspaceId: string, tokens: number): Promise<void> {
    if (!this.prisma.enabled) return;
    const period = usagePeriod(new Date());
    await this.prisma.aiUsage.upsert({
      where: { workspaceSlug_period: { workspaceSlug: workspaceId, period } },
      create: { workspaceSlug: workspaceId, period, calls: 1, tokens },
      update: { calls: { increment: 1 }, tokens: { increment: tokens } },
    });
  }

  async usage(workspaceId: string): Promise<AiUsageView> {
    const period = usagePeriod(new Date());
    const row = this.prisma.enabled
      ? await this.prisma.aiUsage.findUnique({
          where: { workspaceSlug_period: { workspaceSlug: workspaceId, period } },
        })
      : null;
    return {
      period,
      calls: row?.calls ?? 0,
      tokens: row?.tokens ?? 0,
      quota: this.monthlyQuota ?? null,
    };
  }

  async generateVariants(workspaceId: string, dto: GenerateVariantsDto): Promise<AiVariant[]> {
    const provider = this.require();
    await this.assertWithinQuota(workspaceId);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Eres un copywriter de social media. Devuelve EXCLUSIVAMENTE un array JSON con 3 " +
          'objetos {"tag","text"}. "tag" es una etiqueta corta de la variante (p.ej. ' +
          '"Directo", "Storytelling", "Con CTA"). "text" es el caption listo para publicar. ' +
          "Sin comentarios ni markdown fuera del JSON.",
      },
      {
        role: "user",
        content: [
          `Plataforma: ${dto.channel}`,
          `Tono: ${dto.tone}`,
          dto.format ? `Tipo de contenido: ${dto.format}` : null,
          dto.length ? `Longitud: ${dto.length}` : null,
          `Brief: ${dto.prompt}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];
    const raw = await provider.complete(messages, { temperature: 0.9 });
    await this.record(workspaceId, estimateTokens(dto.prompt, raw));
    const parsed = extractJson<AiVariant[]>(raw);
    if (!Array.isArray(parsed)) {
      throw new ServiceUnavailableException(
        "La IA devolvió una respuesta no válida. Intenta de nuevo.",
      );
    }
    return parsed
      .filter((v) => v && typeof v.text === "string")
      .map((v) => ({ tag: String(v.tag ?? "Variante"), text: String(v.text) }))
      .slice(0, 3);
  }

  async suggestHashtags(workspaceId: string, dto: SuggestHashtagsDto): Promise<string[]> {
    const provider = this.require();
    await this.assertWithinQuota(workspaceId);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Eres un experto en social media. Devuelve EXCLUSIVAMENTE un array JSON de strings " +
          "con 8-12 hashtags relevantes (incluye el símbolo #). Sin texto adicional.",
      },
      { role: "user", content: dto.prompt },
    ];
    const raw = await provider.complete(messages, { temperature: 0.7, maxTokens: 300 });
    await this.record(workspaceId, estimateTokens(dto.prompt, raw));
    const parsed = extractJson<string[]>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((h): h is string => typeof h === "string")
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .slice(0, 12);
  }

  /** Mejora un mensaje manteniendo sus variables {{...}}. */
  async improve(workspaceId: string, dto: ImproveMessageDto): Promise<{ text: string }> {
    const provider = this.require();
    await this.assertWithinQuota(workspaceId);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Eres copywriter experto de WhatsApp marketing. Mejora el mensaje para que sea más " +
          "claro, persuasivo y con buen gancho, SIN inventar datos y MANTENIENDO intactas las " +
          "variables {{...}}. Devuelve solo el mensaje final.",
      },
      { role: "user", content: dto.message },
    ];
    const raw = await provider.complete(messages, { temperature: 0.7 });
    await this.record(workspaceId, estimateTokens(dto.message, raw));
    return { text: raw.trim() };
  }

  /** Mejores horarios de envío (heurístico desde el historial; no usa IA). */
  async bestSendTimes(workspaceId: string): Promise<BestTimes> {
    const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const byDay = Array(7).fill(0);
    const byHour = Array(24).fill(0);
    let sampleSize = 0;
    if (this.prisma.enabled) {
      const rows = await this.prisma.sendLog.findMany({
        where: { workspaceSlug: workspaceId, ok: true },
        select: { createdAt: true },
        take: 1000,
      });
      for (const r of rows) {
        const d = r.createdAt;
        byDay[d.getDay()]++;
        byHour[d.getHours()]++;
        sampleSize++;
      }
    }
    const topDay = sampleSize ? DAYS[byDay.indexOf(Math.max(...byDay))] : null;
    const topHour = sampleSize ? `${String(byHour.indexOf(Math.max(...byHour))).padStart(2, "0")}:00` : null;
    return { sampleSize, topDay, topHour, byDay: DAYS.map((label, i) => ({ label, count: byDay[i] })) };
  }

  /**
   * Recomendaciones accionables desde los grupos, historial y plantillas.
   * Degrada limpio: sin proveedor de IA devuelve solo los horarios.
   */
  async recommendations(workspaceId: string): Promise<{
    recommendations: AiRecommendation[];
    times: BestTimes;
    aiConfigured: boolean;
  }> {
    const times = await this.bestSendTimes(workspaceId);
    if (!this.provider) return { recommendations: [], times, aiConfigured: false };
    await this.assertWithinQuota(workspaceId);

    const [groups, logs, templates] = this.prisma.enabled
      ? await Promise.all([
          this.prisma.group.findMany({ where: { workspaceSlug: workspaceId }, take: 40 }),
          this.prisma.sendLog.findMany({
            where: { workspaceSlug: workspaceId },
            orderBy: { createdAt: "desc" },
            take: 40,
          }),
          this.prisma.template.findMany({ where: { workspaceSlug: workspaceId }, take: 40 }),
        ])
      : [[], [], []];

    const context = {
      grupos: groups.map((g) => ({ nombre: g.name, miembros: g.members })),
      envios_recientes: logs.map((l) => ({ campaña: l.campaignName, destino: l.groupName, ok: l.ok })),
      plantillas: templates.map((t) => t.name),
    };
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Eres estratega de marketing por WhatsApp y redes. Analiza el contexto y da " +
          "recomendaciones accionables para mejorar alcance, engagement y conversión. " +
          "Responde EXCLUSIVAMENTE con un array JSON (máx 6) de objetos " +
          '{"titulo","detalle","categoria"} donde categoria es uno de ' +
          '"campaña"|"mensaje"|"segmentacion"|"horario"|"otro". En español, concreto.',
      },
      { role: "user", content: `Contexto (JSON):\n${JSON.stringify(context)}` },
    ];
    const raw = await this.provider.complete(messages, { temperature: 0.8 });
    await this.record(workspaceId, estimateTokens(JSON.stringify(context), raw));
    const parsed = extractJson<AiRecommendation[]>(raw) ?? [];
    const recommendations = (Array.isArray(parsed) ? parsed : [])
      .filter((r) => r && (r.titulo || r.detalle))
      .slice(0, 6)
      .map((r) => ({
        titulo: String(r.titulo ?? "Sugerencia"),
        detalle: String(r.detalle ?? ""),
        categoria: String(r.categoria ?? "otro"),
      }));
    return { recommendations, times, aiConfigured: true };
  }
}

@ApiTags("ai")
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PlanGuard)
@Controller("workspaces/:workspace/ai")
export class AiController {
  constructor(private readonly service: AiService) {}

  @Get("usage")
  usage(@WorkspaceId() workspaceId: string) {
    return this.service.usage(workspaceId);
  }

  @Post("variants")
  @RequiresActivePlan()
  variants(@WorkspaceId() workspaceId: string, @Body() dto: GenerateVariantsDto) {
    return this.service.generateVariants(workspaceId, dto);
  }

  @Post("hashtags")
  @RequiresActivePlan()
  async hashtags(@WorkspaceId() workspaceId: string, @Body() dto: SuggestHashtagsDto) {
    return { hashtags: await this.service.suggestHashtags(workspaceId, dto) };
  }

  @Post("improve")
  @RequiresActivePlan()
  improve(@WorkspaceId() workspaceId: string, @Body() dto: ImproveMessageDto) {
    return this.service.improve(workspaceId, dto);
  }

  /** Recomendaciones + mejores horarios. No exige plan (degrada sin IA). */
  @Get("recommendations")
  recommendations(@WorkspaceId() workspaceId: string) {
    return this.service.recommendations(workspaceId);
  }
}

@Module({ controllers: [AiController], providers: [AiService] })
export class AiModule {}
