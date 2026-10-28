import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_perfil_${stamp}@nv.tv`;

test("profile: rename, change password, sign in with the new one; a new brand has no example data", async ({ page }) => {
  // A brand created by the customer (not a built-in one): the case that used
  // to show another brand's data.
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Perfil", email, password: PASSWORD, acceptTerms: true },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { name: `Perfil ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  expect(created.ok()).toBeTruthy();
  const { slug: WS } = (await created.json()) as { slug: string };
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  // A new brand starts clean: no example-data banner on the dashboard.
  await page.goto(`/w/${WS}/dashboard`, { waitUntil: "networkidle" });
  await expect(page.locator("body")).toContainText("Hola, E2E", { timeout: 10000 });
  await expect(page.getByTestId("sample-data-banner")).toHaveCount(0);
  // Contacts open on this brand and start empty (no invented customers).
  await page.goto(`/w/${WS}/contactos`, { waitUntil: "networkidle" });
  await expect(page.locator("body")).not.toContainText("Julio Ramírez");
  await page.goto(`/w/${WS}/dashboard`, { waitUntil: "networkidle" });

  // The user menu opens the profile page.
  await page.getByTitle("E2E Perfil").click();
  await page.getByRole("menuitem", { name: "Mi perfil" }).click();
  await page.waitForURL(`**/w/${WS}/perfil`);

  await page.fill("#profile-name", "Lucía   Perfil");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByTitle("Lucía Perfil")).toBeVisible({ timeout: 10000 });

  // Wrong current password is refused with a clear message.
  await page.fill("#pw-current", "no-es-esta");
  await page.fill("#pw-new", "nueva-clave-123");
  await page.fill("#pw-confirm", "nueva-clave-123");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.locator("body")).toContainText("La contraseña actual no es correcta");

  await page.fill("#pw-current", PASSWORD);
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.locator("body")).toContainText("Contraseña cambiada", { timeout: 10000 });

  // Still signed in here after the change (fresh session), name survives a reload.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#profile-name")).toHaveValue("Lucía Perfil", { timeout: 10000 });

  // Sign out, then in with the new password.
  await page.getByTitle("Lucía Perfil").click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await page.waitForURL("**/login");
  await page.fill("#email", email);
  await page.fill("#password", "nueva-clave-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 });
});
