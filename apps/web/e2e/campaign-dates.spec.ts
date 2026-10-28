import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_fechas_${stamp}@nv.tv`;

test("campaign: publish every day only between two dates", async ({ page }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Fechas", email, password: PASSWORD, acceptTerms: true },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Fechas ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  expect(created.ok()).toBeTruthy();
  const { slug: WS } = (await created.json()) as { slug: string };

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  await page.goto(`/w/${WS}/campanas`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nueva campaña" }).first().click();
  await page.fill("#cp-name", "Promo 28 al 30");
  await page.getByRole("button", { name: "Facebook" }).click();
  await page.getByRole("button", { name: "Diario", exact: true }).click();
  const range = page.getByTestId("campaign-date-range");
  await expect(range).toContainText("Sin fechas, publica todos los días");
  await page.fill("#cp-start-date", "2026-10-28");
  await page.fill("#cp-end-date", "2026-10-30");
  await expect(range).toContainText("Publicará del 28 al 30 de oct. y luego se marcará como completada.");
  await page.getByRole("button", { name: "Crear campaña" }).click();
  await expect(page.locator("body")).toContainText("del 28 al 30 de oct.", { timeout: 10000 });

  // Saved on the campaign, and an end before the start is refused.
  const list = await page.request.get(`${API}/workspaces/${WS}/campaigns`, { headers: auth });
  const body = (await list.json()) as { items?: { id: string; startDate: string; endDate: string }[] } | { id: string; startDate: string; endDate: string }[];
  const items = Array.isArray(body) ? body : (body.items ?? []);
  expect(items[0]).toMatchObject({ startDate: "2026-10-28", endDate: "2026-10-30" });
  const bad = await page.request.patch(`${API}/workspaces/${WS}/campaigns/${items[0]!.id}`, {
    headers: auth,
    data: { endDate: "2026-10-27" },
  });
  expect(bad.status()).toBe(400);
});
