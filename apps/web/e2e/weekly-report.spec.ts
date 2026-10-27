import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const WS = "password-vault";

test("weekly report: this week so far, with what needs attention, and CSV", async ({ page }) => {
  const email = `e2e_report_${Date.now()}@nv.tv`;
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Informe", email, password: PASSWORD, workspaceSlug: WS, acceptTerms: true },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // Real data this week: a contact, and a task already overdue.
  expect((await page.request.post(`${API}/workspaces/${WS}/contacts`, { headers: auth, data: { name: "Lucía Informe" } })).ok()).toBeTruthy();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  expect(
    (await page.request.post(`${API}/workspaces/${WS}/tasks`, { headers: auth, data: { title: "Llamar a proveedor", dueAt: yesterday } })).ok(),
  ).toBeTruthy();
  // Payments: one confirmed, one the customer says they paid (waiting for a check).
  const newPayment = async (concept: string, amount: number) => {
    const r = await page.request.post(`${API}/workspaces/${WS}/payments`, {
      headers: auth,
      data: { concept, amount, currency: "COP" },
    });
    expect(r.ok()).toBeTruthy();
    return ((await r.json()) as { id: string }).id;
  };
  const paid = await newPayment("Plan Pro", 150000);
  expect((await page.request.patch(`${API}/workspaces/${WS}/payments/${paid}`, { headers: auth, data: { status: "pagado" } })).ok()).toBeTruthy();
  const claimed = await newPayment("Pedido 12", 80000);
  expect(
    (
      await page.request.patch(`${API}/workspaces/${WS}/payments/${claimed}`, {
        headers: auth,
        data: { status: "por_verificar", reference: "M777" },
      })
    ).ok(),
  ).toBeTruthy();
  // The team gets an in-app notice to go check the account.
  const notices = (await (await page.request.get(`${API}/workspaces/${WS}/notifications`, { headers: auth })).json()) as {
    title: string;
    meta?: string;
  }[];
  expect(notices).toEqual(
    expect.arrayContaining([expect.objectContaining({ title: "Cobro por verificar: Pedido 12", meta: expect.stringContaining("ref M777") })]),
  );

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/w/${WS}/**`, { timeout: 20000 });

  // Reachable from Analytics.
  await page.goto(`/w/${WS}/analytics`, { waitUntil: "networkidle" });
  await page.getByTestId("analytics-provenance").getByRole("link", { name: "Informe semanal" }).click();
  await expect(page.getByRole("heading", { name: "Informe semanal" })).toBeVisible();

  // No closed week yet → the current week, live.
  await expect(page.locator("#report-week")).toHaveValue("actual");
  await expect(page.getByTestId("report-provenance")).toContainText("En curso");
  const contacts = page.getByTestId("report-metrics").locator("div", { hasText: "Contactos nuevos" }).first();
  await expect(contacts).toContainText("1");
  const attention = page.getByTestId("report-attention");
  await expect(attention).toContainText("Tareas vencidas");
  await expect(attention).toContainText("Llamar a proveedor");
  await expect(attention.getByRole("link", { name: "Ir a Tareas" })).toHaveAttribute("href", `/w/${WS}/tareas`);
  await expect(attention).toContainText("Cobros por verificar");
  await expect(attention).toContainText("Pedido 12");
  await expect(attention).toContainText("$ 80.000 COP · ref M777");

  // Money confirmed this week, in its own currency.
  const payments = page.getByTestId("report-payments");
  await expect(payments).toContainText("$ 150.000 COP");
  await expect(payments).toContainText("1 cobro · semana anterior: $ 0 COP (0)");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^informe-semanal-password-vault-\d{4}-\d{2}-\d{2}-en-curso\.csv$/);
});
