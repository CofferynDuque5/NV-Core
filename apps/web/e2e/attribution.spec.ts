import { expect, test } from "@playwright/test";

import { API, PASSWORD, registerInto } from "./helpers";

const email = `e2e_attr_${Date.now()}@nv.tv`;
const WS = "womens-health";

test("public form keeps the lead's UTM origin and shows it in CRM and analytics", async ({ page }) => {
  await registerInto(page, { name: "E2E Origen", email, workspace: WS });

  const login = await page.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = (await login.json()) as { accessToken: string };
  const created = await page.request.post(`${API}/workspaces/${WS}/forms`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      name: "Lista de espera",
      fields: [
        { key: "name", label: "Nombre", required: true },
        { key: "email", label: "Email", required: true },
      ],
    },
  });
  expect(created.ok(), `create form → ${created.status()}`).toBeTruthy();
  const form = (await created.json()) as { id: string };

  // A visitor arrives from an Instagram ad link.
  await page.goto(`/f/${form.id}?utm_source=Instagram&utm_medium=paid&utm_campaign=lanzamiento`, {
    waitUntil: "networkidle",
  });
  await page.fill("#pf-name", "Lucía Origen");
  await page.fill("#pf-email", `lucia_${Date.now()}@example.com`);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator("body")).toContainText("Gracias", { timeout: 10000 });

  // The contact shows where it came from.
  await page.goto(`/w/${WS}/contactos`, { waitUntil: "networkidle" });
  await page.getByText("Lucía Origen").first().click();
  const origin = page.getByTestId("contact-origin");
  await expect(origin).toContainText("instagram", { timeout: 10000 });
  await expect(origin).toContainText("lanzamiento");
  await expect(origin).toContainText("Lista de espera");

  // And it is counted in analytics.
  await page.goto(`/w/${WS}/analytics`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("lead-sources")).toContainText("instagram", { timeout: 15000 });
});
