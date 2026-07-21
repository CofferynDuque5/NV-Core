import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { buildConfig } from "./config/configuration";
import { validateEnv } from "./config/env.validation";
import { CommonModule } from "./common/common.module";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";

import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { GroupsModule } from "./modules/groups/groups.module";
import { SegmentsModule } from "./modules/segments/segments.module";
import { CampaignsModule } from "./modules/campaigns/campaigns.module";
import { PostsModule } from "./modules/posts/posts.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { InboxModule } from "./modules/inbox/inbox.module";
import { MediaModule } from "./modules/media/media.module";
import { TemplatesModule } from "./modules/templates/templates.module";
import { AutomationsModule } from "./modules/automations/automations.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { ConnectionsModule } from "./modules/connections/connections.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { TeamModule } from "./modules/team/team.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AiModule } from "./modules/ai/ai.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { BillingModule } from "./modules/billing/billing.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => buildConfig(validateEnv(raw)),
    }),
    CommonModule,
    PrismaModule,
    HealthModule,

    // Feature modules (one per @nv/domain service)
    WorkspacesModule,
    ContactsModule,
    GroupsModule,
    SegmentsModule,
    CampaignsModule,
    PostsModule,
    CalendarModule,
    InboxModule,
    MediaModule,
    TemplatesModule,
    AutomationsModule,
    AnalyticsModule,
    ConnectionsModule,
    IntegrationsModule,
    NotificationsModule,
    TeamModule,
    AuditModule,
    AiModule,
    MessagingModule,
    BillingModule,
  ],
})
export class AppModule {}
