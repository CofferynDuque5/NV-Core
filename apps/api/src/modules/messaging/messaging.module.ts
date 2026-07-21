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
import { IsString } from "class-validator";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

export class SendMessageDto {
  @IsString()
  channel!: string;

  @IsString()
  to!: string;

  @IsString()
  body!: string;
}

@Injectable()
export class MessagingService {
  // TODO(phase 2): WhatsApp Business API / Meta Graph / Telegram.
  send(_workspaceId: string, _dto: SendMessageDto): never {
    throw new NotImplementedException(
      "Proveedor de mensajería no configurado (WhatsApp / Telegram / Email).",
    );
  }
}

@ApiTags("messaging")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/messaging")
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Post("send")
  send(@WorkspaceId() workspaceId: string, @Body() dto: SendMessageDto) {
    return this.service.send(workspaceId, dto);
  }
}

@Module({ controllers: [MessagingController], providers: [MessagingService] })
export class MessagingModule {}
