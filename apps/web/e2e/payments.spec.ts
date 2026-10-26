import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const WS = "nv-stream";

test("manual payments: method, request, customer message, verify, duplicate reference blocked", async ({ page }) => {
  const email = `e2e_cobros_${Date.now()}@nv.tv`;
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Cobros", email, password: PASSWORD, workspaceSlug: WS },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  expect((await page.request.post(`${API}/workspaces/${WS}/contacts`, { headers: auth, data: { name: "Camila Pagos" } })).ok()).toBeTruthy();

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/w/${WS}/**`, { timeout: 20000 });

  await page.goto(`/w/${WS}/cobros`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Cobros", exact: true })).toBeVisible();

  // 1. Where the brand gets paid: Nequi (Colombia).
  await page.getByRole("button", { name: "Añadir método" }).first().click();
  await page.selectOption("#pm-kind", "nequi");
  await page.fill("#pm-field-phone", "300 123 4567");
  await page.fill("#pm-field-holder", "NV Marketing SAS");
  await page.getByRole("dialog").getByRole("button", { name: "Añadir método" }).click();
  await page.getByRole("tab", { name: /Métodos de cobro/ }).click();
  await expect(page.getByTestId("methods-CO")).toContainText("300 123 4567");

  // 2. A request in COP for a contact; the message is ready to copy.
  await page.getByRole("tab", { name: "Cobros" }).click();
  const createPayment = async (concept: string) => {
    await page.getByRole("button", { name: "Nuevo cobro" }).first().click();
    await page.fill("#py-concept", concept);
    await page.fill("#py-amount", "150000");
    await page.selectOption("#py-currency", "COP");
    await expect(page.getByTestId("py-methods-hint")).toContainText("Nequi");
    await page.selectOption("#py-contact", { label: "Camila Pagos" });
    await page.getByRole("button", { name: "Crear cobro" }).click();
  };
  await createPayment("Plan mensual octubre");
  const sheet = page.getByTestId("payment-sheet");
  await expect(sheet).toBeVisible();
  const message = sheet.getByLabel("Mensaje para el cliente");
  await expect(message).toHaveValue(/Hola Camila Pagos/);
  await expect(message).toHaveValue(/\$ 150\.000 COP/);
  await expect(message).toHaveValue(/300 123 4567/);
  await expect(message).toHaveValue(/comprobante/);

  // 3. The customer says they paid; then we confirm after checking the account.
  await sheet.locator("#pv-method").selectOption({ label: "Nequi" });
  await sheet.locator("#pv-reference").fill("M123456");
  await sheet.getByRole("button", { name: "El cliente dice que ya pagó" }).click();
  await expect(sheet).toContainText("Por verificar");
  await sheet.getByRole("button", { name: "Confirmar pago" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, lo recibí" }).click();
  await expect(sheet).toContainText("Confirmado por");
  await expect(sheet).toContainText("ref. M123456");
  await page.keyboard.press("Escape");
  await expect(page.getByText("$ 150.000 COP").first()).toBeVisible();

  // 4. The same receipt cannot confirm a second payment.
  await createPayment("Plan mensual noviembre");
  await sheet.locator("#pv-reference").fill("m123456");
  await sheet.getByRole("button", { name: "Confirmar pago" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, lo recibí" }).click();
  await expect(sheet).toContainText("ya confirmó el cobro");
  await expect(sheet).toContainText("Pendiente");
  await page.keyboard.press("Escape");

  // 5. The contact's card lists both.
  await page.goto(`/w/${WS}/contactos`, { waitUntil: "networkidle" });
  await page.getByText("Camila Pagos").first().click();
  const section = page.getByTestId("contact-payments");
  await expect(section).toContainText("Plan mensual octubre");
  await expect(section).toContainText("Plan mensual noviembre");
});
