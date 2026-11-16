import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_lineas_${stamp}@nv.tv`;

test("WhatsApp: the brand lists its numbers and offers to add more", async ({ page }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Líneas", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Lineas ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };

  // Only the main number to start with; it can't be removed.
  const lines = await page.request.get(`${API}/workspaces/${WS}/whatsapp/lines`, { headers: auth });
  expect(await lines.json()).toEqual([expect.objectContaining({ line: 1, status: "disconnected" })]);
  const del = await page.request.delete(`${API}/workspaces/${WS}/whatsapp/lines/1`, { headers: auth });
  expect(del.status()).toBe(400);

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);
  await page.goto(`/w/${WS}/conexiones`, { waitUntil: "networkidle" });
  await expect(page.locator("body")).toContainText("Más números de WhatsApp");
  await expect(page.getByTestId("wa-line-add")).toBeEnabled();
  await expect(page.getByTestId("wa-line")).toHaveCount(0);
});
