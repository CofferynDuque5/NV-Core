import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_marca_${stamp}@nv.tv`;

test("brand: goals reorder the panel, Tienda products to campaigns, rename and delete the brand", async ({ page }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Marca", email, password: PASSWORD, acceptTerms: true },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Marca ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  expect(created.ok()).toBeTruthy();
  const { slug: WS, name: NAME } = (await created.json()) as { slug: string; name: string };

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  // «¿Qué quieres lograr primero?» right on the dashboard; the menu follows it.
  await page.goto(`/w/${WS}/dashboard`, { waitUntil: "networkidle" });
  const picker = page.getByTestId("goal-picker");
  await picker.getByRole("button", { name: "Vender y cobrar" }).click();
  await picker.getByRole("button", { name: "Personalizar mi panel" }).click();
  await expect(page.getByTestId("goal-steps")).toContainText("Tu objetivo: Vender y cobrar", { timeout: 10000 });
  const nav = page.locator("aside nav");
  await expect(nav).toContainText("TU OBJETIVO");
  await expect(nav.locator("a").nth(1)).toHaveText("Tienda");
  // Saved on the brand: still there after a reload.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("aside nav").locator("a").nth(1)).toHaveText("Tienda", { timeout: 10000 });

  // Tienda: a product with prices in two currencies, then a campaign from it.
  await page.getByTestId("goal-steps").getByRole("link", { name: /Abrir Tienda/ }).click();
  await page.waitForURL(`**/w/${WS}/tienda`);
  await page.getByRole("button", { name: "Agregar el primero" }).click();
  await page.fill("#pr-name", "Combo Netflix");
  await page.fill("#pr-category", "Streaming");
  await page.fill("#pr-description", "Pantalla 1 mes, entrega inmediata.");
  await page.fill("#pr-price-USD", "4");
  await page.fill("#pr-price-VES", "350");
  await page.getByRole("button", { name: "Agregar a la Tienda" }).click();
  const card = page.getByTestId("product-card").filter({ hasText: "Combo Netflix" });
  await expect(card).toContainText("$ 4 USD · Bs 350", { timeout: 10000 });
  await card.getByRole("button", { name: "Crear campaña" }).click();
  await expect(page.locator("#cp-name")).toHaveValue("Combo Netflix");
  await expect(page.locator("#cp-message")).toHaveValue(/Precio: \{\{precio\}\}/);
  await page.getByRole("button", { name: "Cancelar" }).click();

  // Rename the brand.
  await page.goto(`/w/${WS}/configuracion?tab=marca`, { waitUntil: "networkidle" });
  await page.fill("#brand-name", "Marca Renombrada");
  await page.getByRole("button", { name: "Guardar marca" }).click();
  await expect(page.locator("body")).toContainText("Marca actualizada", { timeout: 10000 });
  await expect(page.locator("aside")).toContainText("Marca Renombrada");

  // Delete it: the name must be typed exactly.
  await page.getByRole("button", { name: /Eliminar «Marca Renombrada»/ }).click();
  const confirmBtn = page.getByRole("button", { name: "Eliminar para siempre" });
  await page.getByLabel("Nombre de la marca").fill(NAME);
  await expect(confirmBtn).toBeDisabled();
  await page.getByLabel("Nombre de la marca").fill("Marca Renombrada");
  await confirmBtn.click();
  await page.waitForURL("**/onboarding", { timeout: 15000 });
  const list = await page.request.get(`${API}/workspaces`, { headers: auth });
  expect(((await list.json()) as { slug: string }[]).map((w) => w.slug)).not.toContain(WS);
});
