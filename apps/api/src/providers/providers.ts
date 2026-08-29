import { Injectable } from "@nestjs/common";

import type { ChannelAdapter, Provider, ProviderId } from "./provider.types";
import { WhatsappBaileysAdapter } from "./adapters/whatsapp-baileys.adapter";
import { WhatsappCloudApiAdapter } from "./adapters/whatsapp-cloud-api.adapter";
import {
  FacebookMetaGraphAdapter,
  InstagramMetaGraphAdapter,
} from "./adapters/meta-graph.adapter";
import {
  FacebookBrowserAutomationAdapter,
  InstagramBrowserAutomationAdapter,
} from "./adapters/browser-automation.adapter";
import {
  FacebookAyrshareAdapter,
  InstagramAyrshareAdapter,
} from "./adapters/ayrshare.adapter";
import { ResendAdapter } from "./adapters/resend.adapter";
import { TiktokOfficialApiAdapter } from "./adapters/tiktok-official-api.adapter";
import { TelegramBotApiAdapter } from "./adapters/telegram-bot-api.adapter";
import { TelegramUserAdapter } from "./adapters/telegram-user.adapter";

abstract class BaseProvider implements Provider {
  abstract readonly id: ProviderId;
  abstract readonly label: string;
  abstract readonly defaultAdapterId: string;
  abstract readonly adapters: ChannelAdapter[];
  adapter(id: string): ChannelAdapter | undefined {
    return this.adapters.find((a) => a.id === id);
  }
}

@Injectable()
export class WhatsappProvider extends BaseProvider {
  readonly id: ProviderId = "whatsapp";
  readonly label = "WhatsApp";
  // Baileys (WhatsApp Web / QR) is the default channel: it works with just the
  // scanned session, with no dependency on Meta's Cloud API credentials. The
  // official Cloud API stays available as an opt-in for whoever provides a token.
  // Workspaces that already chose an adapter keep their stored ProviderSelection.
  readonly defaultAdapterId = "baileys";
  readonly adapters: ChannelAdapter[];
  constructor(cloud: WhatsappCloudApiAdapter, baileys: WhatsappBaileysAdapter) {
    super();
    // Baileys first so it's the primary option in the Conexiones adapter list.
    this.adapters = [baileys, cloud];
  }
}

@Injectable()
export class TelegramProvider extends BaseProvider {
  readonly id: ProviderId = "telegram";
  readonly label = "Telegram";
  // User account via QR (MTProto) is the default: it reaches every group and
  // channel the account belongs to, auto-imported on sync. The official Bot API
  // stays available for whoever prefers a bot + manual chat_id.
  readonly defaultAdapterId = "user-mtproto";
  readonly adapters: ChannelAdapter[];
  constructor(user: TelegramUserAdapter, bot: TelegramBotApiAdapter) {
    super();
    this.adapters = [user, bot];
  }
}

@Injectable()
export class FacebookProvider extends BaseProvider {
  readonly id: ProviderId = "facebook";
  readonly label = "Facebook";
  // Meta Graph stays the default so existing token-based connections keep
  // working untouched. Ayrshare (single API key, no Meta app review) is offered
  // as the easy alternative — pick it per workspace in Conexiones.
  readonly defaultAdapterId = "meta-graph";
  readonly adapters: ChannelAdapter[];
  constructor(
    graph: FacebookMetaGraphAdapter,
    ayrshare: FacebookAyrshareAdapter,
    browser: FacebookBrowserAutomationAdapter,
  ) {
    super();
    this.adapters = [graph, ayrshare, browser];
  }
}

@Injectable()
export class InstagramProvider extends BaseProvider {
  readonly id: ProviderId = "instagram";
  readonly label = "Instagram";
  readonly defaultAdapterId = "meta-graph";
  readonly adapters: ChannelAdapter[];
  constructor(
    graph: InstagramMetaGraphAdapter,
    ayrshare: InstagramAyrshareAdapter,
    browser: InstagramBrowserAutomationAdapter,
  ) {
    super();
    this.adapters = [graph, ayrshare, browser];
  }
}

@Injectable()
export class EmailProvider extends BaseProvider {
  readonly id: ProviderId = "email";
  readonly label = "Email";
  readonly defaultAdapterId = "resend";
  readonly adapters: ChannelAdapter[];
  constructor(resend: ResendAdapter) {
    super();
    this.adapters = [resend];
  }
}

@Injectable()
export class TiktokProvider extends BaseProvider {
  readonly id: ProviderId = "tiktok";
  readonly label = "TikTok";
  readonly defaultAdapterId = "official-api";
  readonly adapters: ChannelAdapter[];
  constructor(official: TiktokOfficialApiAdapter) {
    super();
    this.adapters = [official];
  }
}
