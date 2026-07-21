import {
  Body,
  Controller,
  Injectable,
  Module,
  NotImplementedException,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

export class GenerateVariantsDto {
  @IsString()
  @MinLength(3)
  prompt!: string;

  @IsString()
  channel!: string;

  @IsString()
  tone!: string;
}

@Injectable()
export class AiService {
  // TODO(phase 2): route to OpenAI / Anthropic / Gemini based on config + selection.
  generateVariants(_workspaceId: string, _dto: GenerateVariantsDto): never {
    throw new NotImplementedException(
      "AI provider no configurado. Define OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY.",
    );
  }
}

@ApiTags("ai")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/ai")
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post("variants")
  variants(@WorkspaceId() workspaceId: string, @Body() dto: GenerateVariantsDto) {
    return this.service.generateVariants(workspaceId, dto);
  }
}

@Module({ controllers: [AiController], providers: [AiService] })
export class AiModule {}
