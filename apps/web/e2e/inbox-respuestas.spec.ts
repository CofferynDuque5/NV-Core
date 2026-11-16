import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_inbox_rp_${stamp}@nv.tv`;

test("Inbox: respuestas guardadas, ficha del cliente, producto y cobro desde el chat", async ({ page }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Respuestas", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Respuestas ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };
  await page.request.post(`${API}/workspaces/${WS}/inbox/conversations`, {
    headers: auth,
    data: { channel: "wa", contactName: "Lucía Pérez", contactHandle: "584121110000" },
  });
  await page.request.post(`${API}/workspaces/${WS}/products`, {
    headers: auth,
    data: { name: "Plan 1 mes", description: "Pantalla HD", prices: { USD: "10" } },
  });
  const method = await page.request.post(`${API}/workspaces/${WS}/payments/methods`, {
    headers: auth,
    data: { kind: "zinli", label: "Zinli", currency: "USD", details: { email: "pagos@ejemplo.com", holder: "NV Pruebas" } },
  });
  expect(method.status()).toBe(201);

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  await page.goto(`/w/${WS}/inbox`, { waitUntil: "networkidle" });
  await page.getByTestId("inbox-conversation").filter({ hasText: "Lucía Pérez" }).click();

  // Customer card: not in Contactos yet → save it.
  const card = page.getByTestId("chat-contact-card");
  await card.getByTestId("chat-contact-create").click();
  await expect(card.getByTestId("chat-contact-stage")).toHaveText("Lead");

  // Saved replies: start from the examples, then use one with «/».
  await page.getByTestId("inbox-replies-menu").click();
  await page.getByTestId("inbox-replies-edit").click();
  await page.getByTestId("quick-replies-examples").click();
  await expect(page.getByTestId("quick-reply-row")).toHaveCount(4);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByTestId("quick-reply-row")).toHaveCount(0);

  const box = page.getByLabel("Respuesta");
  await box.fill("/preci");
  await expect(page.getByTestId("inbox-slash-suggestions")).toContainText("/Precios");
  await box.press("Enter");
  await expect(box).toHaveValue("Hola Lucía, te paso la lista de precios de hoy. Cualquier duda me dices.");

  // Product from the Tienda goes under it.
  await page.getByTestId("inbox-product-menu").click();
  await page.getByRole("menuitem", { name: "Plan 1 mes" }).click();
  await expect(box).toHaveValue(/\*Plan 1 mes\*\nPantalla HD\nPrecio: .*10/);

  // Charge from the chat: the payment is created for this contact and its message lands in the box.
  await page.getByTestId("inbox-charge").click();
  await page.fill("#py-concept", "Plan 1 mes");
  await page.fill("#py-amount", "10");
  await page.selectOption("#py-currency", "USD");
  await page.getByRole("button", { name: "Crear cobro" }).click();
  await expect(box).toHaveValue(/para pagar «Plan 1 mes»/);
  await expect(box).toHaveValue(/Zinli/);
  await expect(card.getByTestId("chat-contact-payments")).toContainText("Plan 1 mes");
  if (process.env.E2E_SHOTS) {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(4500); // let the toasts go
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/inbox-respuestas.png` });
  }

  // Nothing was sent: the chat still has no messages.
  const list = await page.request.get(`${API}/workspaces/${WS}/inbox/conversations`, { headers: auth });
  const { items } = (await list.json()) as { items: { id: string; preview: string }[] };
  expect(items[0]?.preview).toBe("");
});
