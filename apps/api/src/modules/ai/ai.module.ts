import {
  Body,
  Controller,
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
import { createProvider, type AiProvider, type ChatMessage } from "./ai.providers";

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

@Injectable()
export class AiService {
  private readonly provider: AiProvider | null;

  constructor(config: ConfigService<AppConfig, true>) {
    this.provider = createProvider(config.get("integrations", { infer: true }).ai);
  }

  private require(): AiProvider {
    if (!this.provider) {
      throw new ServiceUnavailableException(
        "Proveedor de IA no configurado. Define OPENAI_API_KEY, ANTHROPIC_API_KEY o GEMINI_API_KEY.",
      );
    }
    return this.provider;
  }

  async generateVariants(_workspaceId: string, dto: GenerateVariantsDto): Promise<AiVariant[]> {
    const provider = this.require();
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

  async suggestHashtags(_workspaceId: string, dto: SuggestHashtagsDto): Promise<string[]> {
    const provider = this.require();
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
@RequiresActivePlan()
@UseGuards(WorkspaceGuard, PlanGuard)
@Controller("workspaces/:workspace/ai")
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post("variants")
  variants(@WorkspaceId() workspaceId: string, @Body() dto: GenerateVariantsDto) {
    return this.service.generateVariants(workspaceId, dto);
  }

  @Post("hashtags")
  async hashtags(@WorkspaceId() workspaceId: string, @Body() dto: SuggestHashtagsDto) {
    return { hashtags: await this.service.suggestHashtags(workspaceId, dto) };
  }
}

@Module({ controllers: [AiController], providers: [AiService] })
export class AiModule {}
