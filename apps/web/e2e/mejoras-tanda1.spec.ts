import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_tanda1_${stamp}@nv.tv`;

test("pausar todo, reintentar fallidos, aviso de choque y stock bajo", async ({ page }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Tanda", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Tanda ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };

  // A scheduled daily campaign (Facebook only, so it needs no groups).
  const c = await page.request.post(`${API}/workspaces/${WS}/campaigns`, {
    headers: auth,
    data: { name: "Diaria 7 pm", message: "Hola", channels: ["fb"], scheduleType: "daily", scheduleTimes: ["19:00"] },
  });
  expect(c.status()).toBe(201);
  const camp = (await c.json()) as { id: string; status: string };
  expect(camp.status).toBe("programada");

  // Nothing failed yet → nothing to retry.
  const retry = await page.request.post(`${API}/workspaces/${WS}/campaigns/${camp.id}/retry-failed`, { headers: auth });
  expect(retry.status()).toBe(400);

  // A product that is running out.
  await page.request.post(`${API}/workspaces/${WS}/products`, {
    headers: auth,
    data: { name: "Kit de prueba", prices: { USD: "5" }, stock: 2 },
  });

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  await page.goto(`/w/${WS}/tienda`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("low-stock-notice")).toContainText("Kit de prueba (quedan 2)");
  await expect(page.getByTestId("stock-badge")).toHaveText("Quedan 2");

  await page.goto(`/w/${WS}/campanas`, { waitUntil: "networkidle" });
  // Same hour and same target → the form warns (no groups here, so no clash).
  await page.getByRole("button", { name: "Nueva campaña" }).first().click();
  await expect(page.locator("#cp-message")).toBeVisible();
  await expect(page.locator("body")).toContainText("{{saludo}}");
  await page.keyboard.press("Escape");

  await page.getByTestId("campaigns-pause-all").click();
  await page.getByRole("button", { name: "Pausar todo" }).last().click();
  await expect(page.locator("body")).toContainText("1 campaña pausada", { timeout: 10000 });
  const after = await page.request.get(`${API}/workspaces/${WS}/campaigns/${camp.id}`, { headers: auth });
  expect(((await after.json()) as { status: string }).status).toBe("pausada");
});
