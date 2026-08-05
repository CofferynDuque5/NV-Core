import { expect, test, type Page } from "@playwright/test";

const email = `e2e_camp_${Date.now()}@nv.tv`;
const WS = "ciclo-creativo";

async function register(page: Page) {
  await page.goto("/register", { waitUntil: "networkidle" });
  await page.fill("#name", "E2E Camp");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.selectOption("#workspace", WS);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/w/${WS}/**`, { timeout: 20000 });
}

test.describe.serial("campaigns", () => {
  test("create → run → pause → delete a campaign", async ({ page }) => {
    await register(page);
    await page.goto(`/w/${WS}/campanas`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(page.locator("body")).toContainText("Aún no hay campañas");

    // Create — name + a channel (toggle Facebook so it has one).
    await page.getByRole("button", { name: "Nueva campaña" }).first().click();
    await page.waitForSelector("#cp-name");
    await page.fill("#cp-name", "Lanzamiento Q3");
    await page.selectOption("#cp-status", "programada");
    await page.getByRole("button", { name: "Facebook" }).click();
    await page.getByRole("button", { name: "Crear campaña" }).click();
    await expect(page.locator("body")).toContainText("Lanzamiento Q3", { timeout: 10000 });

    // Persists across reload.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await expect(page.locator("body")).toContainText("Lanzamiento Q3");

    const card = page.locator("h3", { hasText: "Lanzamiento Q3" }).locator("..").locator("..");

    // Run now (send). Optimistic/settled — the card stays.
    await card.getByTitle("Enviar ahora").click();
    await page.waitForTimeout(500);
    await expect(page.locator("body")).toContainText("Lanzamiento Q3");

    // Pause → the Resume (Reanudar) control appears.
    await card.getByTitle("Pausar").click();
    await expect(card.getByTitle("Reanudar")).toBeVisible({ timeout: 10000 });

    // Edit → rename.
    await card.getByTitle("Editar").click();
    await page.waitForSelector("#cp-name");
    expect(await page.inputValue("#cp-name")).toBe("Lanzamiento Q3");
    await page.fill("#cp-name", "Lanzamiento Q3 (v2)");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.locator("body")).toContainText("Lanzamiento Q3 (v2)", { timeout: 10000 });

    // Delete (confirm dialog) → back to empty.
    await page
      .locator("h3", { hasText: "Lanzamiento Q3 (v2)" })
      .locator("..")
      .locator("..")
      .getByTitle("Eliminar")
      .click();
    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.locator("body")).toContainText("Aún no hay campañas", { timeout: 10000 });
  });
});
