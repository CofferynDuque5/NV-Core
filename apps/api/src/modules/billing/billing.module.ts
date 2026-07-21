import { Controller, Get, Injectable, Module, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { WorkspaceId } from "../../common/tenant/workspace.decorator";
import { WorkspaceGuard } from "../../common/tenant/workspace.guard";

@Injectable()
export class BillingService {
  // TODO(phase 2): Stripe customer portal.
  async portalUrl(_workspaceId: string): Promise<string | null> {
    return null;
  }
}

@ApiTags("billing")
@UseGuards(WorkspaceGuard)
@Controller("workspaces/:workspace/billing")
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get("portal")
  async portal(@WorkspaceId() workspaceId: string) {
    return { url: await this.service.portalUrl(workspaceId) };
  }
}

@Module({ controllers: [BillingController], providers: [BillingService] })
export class BillingModule {}
