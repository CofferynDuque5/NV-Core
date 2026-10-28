import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

// Platform admin (NV_SUPER_ADMINS in CI).
const ADMIN = process.env.E2E_SUPER_ADMIN ?? "e2e_superadmin@nv.tv";

test("«Ver demo» opens the read-only example brand without an account", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByTestId("demo-button").click();
  await page.waitForURL("**/w/nv-demo/**", { timeout: 20000 });
  await expect(page.getByTestId("demo-banner")).toBeVisible();

  // The demo account can look, never change anything.
  const res = await page.request.post(`${API}/auth/demo`);
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const contacts = await page.request.get(`${API}/workspaces/nv-demo/contacts`, { headers });
  expect(contacts.ok()).toBeTruthy();
  const write = await page.request.post(`${API}/workspaces`, { headers, data: { name: "Intento demo" } });
  expect(write.status()).toBe(403);
});

test("the platform admin sees who signs in", async ({ page }) => {
  const stamp = Date.now();
  const someone = `e2e_visita_${stamp}@nv.tv`;
  for (const [name, email] of [["Visita Prueba", someone], ["Admin Plataforma", ADMIN]] as const) {
    const res = await page.request.post(`${API}/auth/register`, {
      data: { name, email, password: PASSWORD, acceptTerms: true },
    });
    // The admin may already exist when the spec is re-run on the same database.
    expect(res.ok() || res.status() === 409, `register ${email} → ${res.status()}`).toBeTruthy();
  }

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", ADMIN);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });

  await page.goto("/admin", { waitUntil: "networkidle" });
  const section = page.getByTestId("admin-logins");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("admin-login-user").filter({ hasText: someone })).toBeVisible();
  await expect(section.getByTestId("admin-login-event").first()).toBeVisible();
});
