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
import { ResendAdapter } from "./adapters/resend.adapter";
import { TiktokOfficialApiAdapter } from "./adapters/tiktok-official-api.adapter";

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
  readonly defaultAdapterId = "baileys";
  readonly adapters: ChannelAdapter[];
  constructor(baileys: WhatsappBaileysAdapter, cloud: WhatsappCloudApiAdapter) {
    super();
    this.adapters = [baileys, cloud];
  }
}

@Injectable()
export class FacebookProvider extends BaseProvider {
  readonly id: ProviderId = "facebook";
  readonly label = "Facebook";
  readonly defaultAdapterId = "meta-graph";
  readonly adapters: ChannelAdapter[];
  constructor(graph: FacebookMetaGraphAdapter, browser: FacebookBrowserAutomationAdapter) {
    super();
    this.adapters = [graph, browser];
  }
}

@Injectable()
export class InstagramProvider extends BaseProvider {
  readonly id: ProviderId = "instagram";
  readonly label = "Instagram";
  readonly defaultAdapterId = "meta-graph";
  readonly adapters: ChannelAdapter[];
  constructor(graph: InstagramMetaGraphAdapter, browser: InstagramBrowserAutomationAdapter) {
    super();
    this.adapters = [graph, browser];
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
