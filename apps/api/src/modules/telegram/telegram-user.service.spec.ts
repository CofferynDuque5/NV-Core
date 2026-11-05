import { afterAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { TelegramUserService, parseTgLineKey, tgLineKey } from "./telegram-user.service";

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
  const notifications = { create: async () => undefined } as never;
  const credentials = { get: async () => ({}) } as never;
  return new TelegramUserService(
    config as never,
    prisma,
    gateway,
    events,
    notifications,
    credentials,
  );
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

  it("submitPassword() rejects when there is no live connection in progress", async () => {
    await expect(makeService(1, "h").submitPassword("w1", "secret")).rejects.toThrow(/conexión/i);
  });

  it("keys extra accounts as slug__tN and parses them back", () => {
    expect(tgLineKey("marca")).toBe("marca");
    expect(tgLineKey("marca", 3)).toBe("marca__t3");
    expect(parseTgLineKey("marca__t3")).toEqual({ workspaceSlug: "marca", line: 3 });
    expect(parseTgLineKey("mi__marca")).toEqual({ workspaceSlug: "mi__marca", line: 1 });
  });

  it("sends to a group from the account that is in it", async () => {
    const svc = makeService(1, "h");
    const sent: string[] = [];
    const fake = (name: string) => ({
      isConnected: true,
      sendText: async (to: string) => {
        sent.push(`${name}:${to}`);
        return { id: "1" };
      },
    });
    const live = (svc as unknown as { live: Map<string, unknown> }).live;
    live.set("w1", fake("main"));
    live.set("w1__t2", fake("ventas"));
    (svc as unknown as { prisma: unknown }).prisma = {
      enabled: true,
      group: { findFirst: async ({ where }: { where: { remoteJid: string } }) => (where.remoteJid === "-100" ? { tgLine: 2 } : null) },
      conversation: { findFirst: async () => null },
    };
    await svc.sendText("w1", "-100", "hola");
    await svc.sendText("w1", "-200", "hola");
    expect(sent).toEqual(["ventas:-100", "main:-200"]);
  });

  it("says clearly which account is offline instead of sending from another", async () => {
    const svc = makeService(1, "h");
    const live = (svc as unknown as { live: Map<string, unknown> }).live;
    live.set("w1", { isConnected: true, sendText: async () => ({ id: "1" }) });
    (svc as unknown as { prisma: unknown }).prisma = {
      enabled: true,
      group: { findFirst: async () => ({ tgLine: 2 }) },
      conversation: { findFirst: async () => null },
    };
    await expect(svc.sendText("w1", "-100", "hola")).rejects.toThrow(/cuenta 2 de Telegram no está conectada/);
  });
});
