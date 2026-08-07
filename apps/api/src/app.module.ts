import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";

import { buildConfig } from "./config/configuration";
import { validateEnv } from "./config/env.validation";
import { ConditionalThrottlerGuard } from "./common/guards/conditional-throttler.guard";
import { CommonModule } from "./common/common.module";
import { CoreModule } from "./core/core.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SchedulerModule } from "./modules/scheduler/scheduler.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";

import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { ChangelogModule } from "./modules/changelog/changelog.module";
import { FeedbackModule } from "./modules/feedback/feedback.module";
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
import { DesignsModule } from "./modules/designs/designs.module";
import { MarketplaceModule } from "./modules/marketplace/marketplace.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { ConnectionsModule } from "./modules/connections/connections.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { GoogleModule } from "./modules/integrations/google/google.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { TeamModule } from "./modules/team/team.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AiModule } from "./modules/ai/ai.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { BillingModule } from "./modules/billing/billing.module";
import { WhatsappModule } from "./modules/whatsapp/whatsapp.module";
import { SocialModule } from "./modules/social/social.module";
import { ProvidersModule } from "./providers/providers.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => buildConfig(validateEnv(raw)),
    }),
    // Global rate limit: 120 req/min per IP. Sensitive routes tighten this with
    // @Throttle(); the Stripe webhook opts out with @SkipThrottle().
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    CommonModule,
    CoreModule,
    PrismaModule,
    SchedulerModule,
    AuthModule,
    HealthModule,

    // Feature modules (one per @nv/domain service)
    WorkspacesModule,
    OnboardingModule,
    ChangelogModule,
    FeedbackModule,
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
    DesignsModule,
    AnalyticsModule,
    ConnectionsModule,
    IntegrationsModule,
    MarketplaceModule,
    GoogleModule,
    NotificationsModule,
    TeamModule,
    AuditModule,
    AiModule,
    MessagingModule,
    BillingModule,
    WhatsappModule,
    SocialModule,
    ProvidersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ConditionalThrottlerGuard }],
})
export class AppModule {}
