import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_remitentes_${stamp}@nv.tv`;

test("campaign: choose which numbers send it and add products as separate messages; Telegram lists its accounts", async ({
  page,
}) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Remitentes", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Remitentes ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };

  // Telegram has accounts like WhatsApp has numbers: the main one can't be removed.
  const tg = await page.request.get(`${API}/workspaces/${WS}/telegram/lines`, { headers: auth });
  expect(await tg.json()).toEqual([expect.objectContaining({ line: 1, status: "disconnected" })]);
  expect((await page.request.delete(`${API}/workspaces/${WS}/telegram/lines/1`, { headers: auth })).status()).toBe(400);

  // A product without text or image is refused by the server.
  const bad = await page.request.post(`${API}/workspaces/${WS}/campaigns`, {
    headers: auth,
    data: { name: "Mal", items: [{ name: "Vacío", text: "" }] },
  });
  expect(bad.status()).toBe(400);

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  await page.goto(`/w/${WS}/conexiones`, { waitUntil: "networkidle" });
  await expect(page.locator("body")).toContainText("Más cuentas de Telegram");
  await expect(page.getByTestId("tg-line-add")).toBeEnabled();

  await page.goto(`/w/${WS}/campanas`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nueva campaña" }).first().click();
  await page.fill("#cp-name", "Catálogo por productos");
  await expect(page.getByTestId("sender-summary")).toContainText("Número principal");
  await expect(page.getByTestId("sender-summary")).toContainText("Cuenta principal");

  await page.getByTestId("campaign-item-add").click();
  await page.getByTestId("campaign-item-add").click();
  const cards = page.getByTestId("campaign-item");
  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByLabel("Texto del producto 1").fill("*Producto A* a {{precio}}");
  await cards.nth(1).getByLabel("Texto del producto 2").fill("*Producto B* nuevo");
  await expect(page.getByTestId("items-preview")).toContainText("2 mensajes más");
  await page.getByRole("button", { name: "Crear campaña" }).click();
  await expect(page.locator("body")).toContainText("Catálogo por productos", { timeout: 10000 });

  const list = await page.request.get(`${API}/workspaces/${WS}/campaigns`, { headers: auth });
  const body = (await list.json()) as { items?: Record<string, unknown>[] } | Record<string, unknown>[];
  const rows = Array.isArray(body) ? body : (body.items ?? []);
  expect(rows[0]).toMatchObject({
    waLines: [],
    tgLines: [],
    items: [
      expect.objectContaining({ text: "*Producto A* a {{precio}}" }),
      expect.objectContaining({ text: "*Producto B* nuevo" }),
    ],
  });
});
