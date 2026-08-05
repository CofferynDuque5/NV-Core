import {
  AdapterUnsupportedError,
  type AdapterContext,
  type AdapterStatus,
  type ChannelAdapter,
  type HealthResult,
  type ProviderId,
  type PublishInput,
  type PublishResult,
  type SendMediaInput,
  type SendMessageInput,
  type SendResult,
} from "../provider.types";

/**
 * Base adapter: every capability defaults to "unsupported". Concrete adapters
 * override only what they actually implement, keeping each one small and honest
 * about its capabilities (the manager turns unsupported calls into a clear
 * error instead of a silent no-op).
 */
export abstract class BaseAdapter implements ChannelAdapter {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly provider: ProviderId;

  protected unsupported(capability: string): never {
    throw new AdapterUnsupportedError(this.id, capability);
  }

  connect(_ctx: AdapterContext): Promise<AdapterStatus> {
    return this.unsupported("connect");
  }
  disconnect(_ctx: AdapterContext): Promise<AdapterStatus> {
    return this.unsupported("disconnect");
  }
  authenticate(_ctx: AdapterContext): Promise<AdapterStatus> {
    return this.unsupported("authenticate");
  }
  refreshCredentials(_ctx: AdapterContext): Promise<AdapterStatus> {
    return this.unsupported("refreshCredentials");
  }
  publish(_ctx: AdapterContext, _input: PublishInput): Promise<PublishResult> {
    return this.unsupported("publish");
  }
  sendMessage(_ctx: AdapterContext, _input: SendMessageInput): Promise<SendResult> {
    return this.unsupported("sendMessage");
  }
  sendMedia(_ctx: AdapterContext, _input: SendMediaInput): Promise<SendResult> {
    return this.unsupported("sendMedia");
  }
  abstract healthCheck(ctx: AdapterContext): Promise<HealthResult>;
  abstract getStatus(ctx: AdapterContext): Promise<AdapterStatus>;
}
