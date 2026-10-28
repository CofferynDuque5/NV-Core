import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_grupos_${stamp}@nv.tv`;

test("groups: country and price currency, rules, keep out; brand links footer; duplicate and reuse groups", async ({ page }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Grupos", email, password: PASSWORD, acceptTerms: true },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Grupos ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  expect(created.ok()).toBeTruthy();
  const { slug: WS } = (await created.json()) as { slug: string };

  const ids: Record<string, string> = {};
  for (const name of ["Ventas Caracas", "Ofertas Bogotá", "Amigos del barrio"]) {
    const g = await page.request.post(`${API}/workspaces/${WS}/groups`, { headers: auth, data: { name, channel: "wa" } });
    expect(g.ok()).toBeTruthy();
    ids[name] = ((await g.json()) as { id: string }).id;
  }
  const camp = await page.request.post(`${API}/workspaces/${WS}/campaigns`, {
    headers: auth,
    data: { name: "Promo combos", message: "Combo a {{precio}}", targetGroups: [ids["Ventas Caracas"], ids["Ofertas Bogotá"]] },
  });
  expect(camp.ok()).toBeTruthy();

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  // Country (and so the price currency) is read from the group's name.
  await page.goto(`/w/${WS}/grupos`, { waitUntil: "networkidle" });
  const row = (name: string) => page.getByTestId("group-row").filter({ hasText: name });
  await expect(row("Ventas Caracas")).toContainText("Venezuela · Bs (por el nombre)", { timeout: 10000 });
  await expect(row("Ofertas Bogotá")).toContainText("Colombia");
  await expect(row("Amigos del barrio")).toContainText("Sin país");

  // A university group is never posted to.
  await row("Amigos del barrio").getByRole("button", { name: "Configurar" }).click();
  await page.selectOption("#gr-category", "universidad");
  await page.selectOption("#gr-country", "ES");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(row("Amigos del barrio")).toContainText("No apto", { timeout: 10000 });
  await expect(row("Amigos del barrio")).toContainText("España · €");

  // Rules pasted for a manual group: «exige precio» is found.
  await row("Ventas Caracas").getByRole("button", { name: "Configurar" }).click();
  await page.fill("#gr-rules", "Reglas: toda publicación debe llevar precio. Prohibido spam.");
  await page.getByRole("button", { name: "Revisar reglas" }).last().click();
  await expect(page.getByTestId("group-rules-result")).toContainText("precio", { timeout: 10000 });
  await expect(page.locator("#gr-price")).toBeChecked();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(row("Ventas Caracas")).toContainText("Exige precio", { timeout: 10000 });

  // Keep a group out in bulk.
  await page.getByLabel("Seleccionar Ofertas Bogotá").check();
  await page.getByRole("button", { name: "Apartar" }).click();
  await expect(row("Ofertas Bogotá")).toContainText("Apartado", { timeout: 10000 });

  // The brand's links make the footer, ending with NV Marketing.
  await page.goto(`/w/${WS}/configuracion?tab=redes`, { waitUntil: "networkidle" });
  await page.getByLabel("Enlace 1").fill("instagram.com/combos");
  await page.fill("#brand-website", "combos.com");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.locator("body")).toContainText("Redes y web guardadas", { timeout: 10000 });
  await expect(page.getByTestId("footer-preview")).toContainText("Instagram: https://instagram.com/combos");
  await expect(page.getByTestId("footer-preview")).toContainText("https://nvmarketing.nvcorx.com/");

  // Duplicate a campaign; a new one reuses its groups and asks for the price in Bs.
  await page.goto(`/w/${WS}/campanas`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Duplicar Promo combos" }).click();
  await expect(page.locator("body")).toContainText("Promo combos (copia)", { timeout: 10000 });
  await page.getByRole("button", { name: "Nueva campaña" }).first().click();
  await page.getByLabel("Usar grupos de otra campaña").selectOption({ label: "Promo combos (2)" });
  await expect(page.locator("body")).toContainText("2 seleccionado(s)");
  await expect(page.getByLabel("Bolívares (Bs)")).toBeVisible();
  // The kept-out group is flagged as the one that will be skipped.
  await expect(page.getByTestId("blocked-groups")).toContainText("Ofertas Bogotá");
});
