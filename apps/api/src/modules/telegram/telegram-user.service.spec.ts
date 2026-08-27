import { afterAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { TelegramUserService } from "./telegram-user.service";

const DIR = join(tmpdir(), `nvcore-tg-test-${Date.now()}`);

function makeService(apiId?: number, apiHash?: string) {
  const config = {
    get: (key: string) =>
      key === "integrations"
        ? { telegram: { apiId, apiHash }, telegramSessionDir: DIR }
        : undefined,
  };
  const prisma = { enabled: false } as never;
  const gateway = { emitQr: () => undefined, emitStatus: () => undefined } as never;
  const events = { emit: () => undefined } as never;
  return new TelegramUserService(config as never, prisma, gateway, events);
}

afterAll(() => rmSync(DIR, { recursive: true, force: true }));

describe("TelegramUserService", () => {
  it("is not configured without api id/hash", () => {
    expect(makeService().configured).toBe(false);
  });

  it("is configured with api id + hash", () => {
    expect(makeService(37441337, "abc123hashvalue0000").configured).toBe(true);
  });

  it("connect() rejects with a clear message when unconfigured", async () => {
    await expect(makeService().connect("w1")).rejects.toThrow(/no configurado|TELEGRAM_API_ID/i);
  });

  it("status() reports disconnected with no error when idle", async () => {
    const s = await makeService(1, "h").status("w1");
    expect(s.status).toBe("disconnected");
    expect(s.provider).toBe("mtproto");
    expect(s.error ?? null).toBeNull();
    expect(s.groupsCount).toBe(0);
  });
});
