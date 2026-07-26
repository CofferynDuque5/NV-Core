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
import type { AiVariant } from "@nv/domain";
import { IsString, MinLength } from "class-validator";

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
}

export class SuggestHashtagsDto {
  @IsString() @MinLength(3) prompt!: string;
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
        content: `Plataforma: ${dto.channel}\nTono: ${dto.tone}\nBrief: ${dto.prompt}`,
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
}

@Module({ controllers: [AiController], providers: [AiService] })
export class AiModule {}
