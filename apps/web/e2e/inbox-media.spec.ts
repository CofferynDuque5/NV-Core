import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_inbox_media_${stamp}@nv.tv`;
const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../api");

/**
 * Stand-in for WhatsApp: a photo, a voice note and a PDF that a customer sent,
 * already saved in the brand's private chat folder (MEDIA_DIR/<marca>/chat).
 */
function seedMedia(conversationId: string, ws: string): void {
  const script = `
    const fs = require("fs"), path = require("path"), crypto = require("crypto");
    const { PrismaClient } = require("@prisma/client");
    const { webmToOggOpus } = require("./dist/modules/inbox/opus-remux");
    const [conv, ws] = process.argv.slice(1);
    const dir = path.join(process.env.MEDIA_DIR, ws, "chat");
    fs.mkdirSync(dir, { recursive: true });
    const save = (bytes, ext) => { const n = crypto.randomBytes(16).toString("hex") + "." + ext; fs.writeFileSync(path.join(dir, n), bytes); return n; };
    // 2x2 red PNG
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
    const ogg = webmToOggOpus(fs.readFileSync(path.join("src/modules/inbox/__fixtures__/voice-chrome.webm"))).ogg;
    const pdf = Buffer.from("%PDF-1.4\\n1 0 obj<<>>endobj\\ntrailer<<>>\\n%%EOF");
    const p = new PrismaClient();
    const t = Date.now() - 10 * 60000;
    (async () => {
      await p.message.create({ data: { conversationId: conv, direction: "in", text: "📷 Foto ¿tienen este?", createdAt: new Date(t),
        media: { kind: "image", mime: "image/png", size: png.length, file: save(png, "png") } } });
      await p.message.create({ data: { conversationId: conv, direction: "in", text: "🎤 Nota de voz", createdAt: new Date(t + 1000),
        media: { kind: "voice", mime: "audio/ogg", size: ogg.length, seconds: 3, file: save(ogg, "ogg") } } });
      await p.message.create({ data: { conversationId: conv, direction: "in", text: "📄 lista.pdf", createdAt: new Date(t + 2000),
        media: { kind: "document", mime: "application/pdf", size: pdf.length, name: "lista.pdf", file: save(pdf, "pdf") } } });
      await p.$disconnect();
    })();
  `;
  execFileSync("node", ["-e", script, conversationId, ws], { cwd: apiDir, env: process.env });
}

/** A new message from the customer, right now. */
function newInbound(conversationId: string, text: string): void {
  const script = `
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    (async () => {
      await p.message.create({ data: { conversationId: process.argv[1], direction: "in", text: process.argv[2] } });
      await p.conversation.update({ where: { id: process.argv[1] }, data: { unreadCount: { increment: 1 } } });
      await p.$disconnect();
    })();
  `;
  execFileSync("node", ["-e", script, conversationId, text], { cwd: apiDir, env: process.env });
}

test("Inbox: fotos, notas de voz y documentos privados; sonido y aviso al llegar un mensaje", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL || !process.env.MEDIA_DIR, "needs DATABASE_URL and MEDIA_DIR to simulate WhatsApp");
  test.setTimeout(90_000);
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Media", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Media ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };
  const conv = await page.request.post(`${API}/workspaces/${WS}/inbox/conversations`, {
    headers: auth,
    data: { channel: "wa", contactName: "Lucía Pérez", contactHandle: "584121110000" },
  });
  const { id } = (await conv.json()) as { id: string };
  seedMedia(id, WS);

  // Push: only real browser push services are accepted (the server would call that address).
  const bad = await page.request.post(`${API}/push/subscribe`, {
    headers: auth,
    data: { endpoint: "https://127.0.0.1/steal", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } },
  });
  expect(bad.status()).toBe(400);
  const key = await page.request.get(`${API}/push/key`, { headers: auth });
  expect(((await key.json()) as { publicKey: string }).publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  await page.goto(`/w/${WS}/inbox?c=${id}`, { waitUntil: "networkidle" });
  // The photo loads through its signed private link.
  const img = page.getByTestId("chat-media-image");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(2);
  await expect(page.getByText("¿tienen este?")).toBeVisible();
  const src = (await img.getAttribute("src"))!;
  expect(src).toContain("/api/inbox-media/");
  const ok = await page.request.get(src);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/png");
  expect(ok.headers()["x-content-type-options"]).toBe("nosniff");
  // A tampered link, or the public files route, never serve chat files.
  const tampered = src.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  expect((await page.request.get(tampered)).status()).toBe(404);
  expect((await page.request.get(`${API}/files/${WS}/chat`)).status()).toBe(404);

  // Voice note: playable audio with speed control; the PDF downloads.
  const audio = page.getByTestId("chat-media-audio").locator("audio");
  await expect(audio).toBeVisible();
  await expect(page.getByTestId("chat-media-audio").getByText("0:03")).toBeVisible();
  await audio.evaluate((el: HTMLAudioElement) => el.load());
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Velocidad 1×" }).click();
  await expect(page.getByRole("button", { name: "Velocidad 1.5×" })).toBeVisible();
  const doc = page.getByTestId("chat-media-document");
  await expect(doc).toContainText("lista.pdf");
  const pdf = await page.request.get((await doc.getAttribute("href"))!);
  expect(pdf.headers()["content-disposition"]).toMatch(/^attachment; filename="lista.pdf"/);

  // Full-size photo and the chat's gallery.
  await img.click();
  await expect(page.getByRole("dialog").getByRole("img", { name: "Foto del chat" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("inbox-gallery").click();
  const gallery = page.getByTestId("chat-media-gallery");
  await expect(gallery.getByText("Fotos y videos")).toBeVisible();
  await expect(gallery.getByText("Audios")).toBeVisible();
  await expect(gallery.getByText("Documentos")).toBeVisible();
  await page.keyboard.press("Escape");

  // Sending a photo while WhatsApp isn't linked says so and adds nothing.
  await expect(page.getByTestId("inbox-voice-start")).toBeVisible();
  await page.getByTestId("inbox-file-input").setInputFiles({
    name: "promo.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64"),
  });
  await expect(page.getByTestId("inbox-pending-file")).toContainText("promo.png");
  await page.getByTestId("inbox-send").click();
  await expect(page.getByText(/No se pudo enviar: tu WhatsApp no está conectado/)).toBeVisible();
  await expect(page.getByTestId("chat-media-image")).toHaveCount(1);
  await page.getByLabel("Quitar archivo").click();

  // Alerts menu: sound on by default, push offered, names from WhatsApp.
  await page.getByTestId("inbox-alerts-menu").click();
  await expect(page.getByTestId("inbox-sound-toggle")).toContainText("Activado");
  await expect(page.getByTestId("inbox-refresh-names")).toBeVisible();
  await page.keyboard.press("Escape");

  // Somewhere else in the panel, a new message pops up with «Abrir» and the count in the title.
  await page.goto(`/w/${WS}/contactos`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  newInbound(id, "¿Me confirmas el precio?");
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Mensaje de Lucía Pérez" });
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await expect(toast).toContainText("¿Me confirmas el precio?");
  await expect.poll(() => page.title()).toMatch(/^\(\d+\) /);
  await toast.getByRole("button", { name: "Abrir" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${WS}/inbox\\?c=${id}`));
  await expect(page.getByText("¿Me confirmas el precio?").last()).toBeVisible();
});
