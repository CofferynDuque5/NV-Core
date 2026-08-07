import { describe, expect, it, vi } from "vitest";

import { TelegramWebhookController } from "./inbox.module";
import type { InboxService } from "./inbox.module";
import type { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";

function makeController(webhookSecret?: string) {
  const recordInbound = vi.fn(async () => undefined);
  const service = { recordInbound } as unknown as InboxService;
  const config = {
    get: vi.fn(() => ({ telegram: { webhookSecret } })),
  } as unknown as ConfigService<AppConfig, true>;
  return { controller: new TelegramWebhookController(service, config), recordInbound };
}

const VALID_BODY = { message: { chat: { id: 9, username: "anap" }, text: "hola" } };

describe("TelegramWebhookController (fail-closed)", () => {
  it("rejects when no secret is configured (even with a header)", async () => {
    const { controller, recordInbound } = makeController(undefined);
    await expect(controller.event(VALID_BODY, "anything")).rejects.toThrow(/Telegram/i);
    expect(recordInbound).not.toHaveBeenCalled();
  });

  it("rejects when the secret is configured but the header is missing", async () => {
    const { controller, recordInbound } = makeController("s3cr3t");
    await expect(controller.event(VALID_BODY, undefined)).rejects.toThrow();
    expect(recordInbound).not.toHaveBeenCalled();
  });

  it("rejects when the header doesn't match", async () => {
    const { controller, recordInbound } = makeController("s3cr3t");
    await expect(controller.event(VALID_BODY, "wrong")).rejects.toThrow();
    expect(recordInbound).not.toHaveBeenCalled();
  });

  it("accepts and records when the secret matches", async () => {
    const { controller, recordInbound } = makeController("s3cr3t");
    const res = await controller.event(VALID_BODY, "s3cr3t");
    expect(res).toEqual({ received: true });
    expect(recordInbound).toHaveBeenCalledTimes(1);
  });

  it("accepts a matching secret but ignores an unparseable body", async () => {
    const { controller, recordInbound } = makeController("s3cr3t");
    const res = await controller.event({ nope: true }, "s3cr3t");
    expect(res).toEqual({ received: true });
    expect(recordInbound).not.toHaveBeenCalled();
  });
});
