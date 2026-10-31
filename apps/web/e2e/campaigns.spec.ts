import { expect, test, type Page } from "@playwright/test";

import { registerInto } from "./helpers";

const email = `e2e_camp_${Date.now()}@nv.tv`;
const WS = "ciclo-creativo";

async function register(page: Page) {
  await registerInto(page, { name: "E2E Camp", email, workspace: WS });
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

    const card = page.getByTestId("campaign-row").filter({ hasText: "Lanzamiento Q3" });

    // Run now (send). Optimistic/settled — the row stays.
    await card.getByTitle("Enviar ahora").click();
    await page.waitForTimeout(500);
    await expect(page.locator("body")).toContainText("Lanzamiento Q3");

    // Pause → it moves to the «Pausadas» tab, with a Resume (Reanudar) control.
    await card.getByTitle("Pausar").click();
    await page.getByTestId("campaign-tab-pausadas").click();
    await expect(card.getByTitle("Reanudar")).toBeVisible({ timeout: 10000 });

    // Edit → rename, file it under a category and keep it as a draft.
    await card.getByTitle("Editar").click();
    await page.waitForSelector("#cp-name");
    expect(await page.inputValue("#cp-name")).toBe("Lanzamiento Q3");
    await page.fill("#cp-name", "Lanzamiento Q3 (v2)");
    await page.getByTestId("campaign-category").fill("Lanzamientos");
    await page.selectOption("#cp-status", "borrador");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.getByTestId("campaign-tab-borradores").click();
    const draft = page.getByTestId("campaign-row").filter({ hasText: "Lanzamiento Q3 (v2)" });
    await expect(draft).toBeVisible({ timeout: 10000 });
    await expect(draft.getByTestId("campaign-category-chip")).toHaveText("Lanzamientos");
    // Still a draft after the list refreshes (it used to flip back to «programada»).
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("campaign-tab-borradores").click();
    await expect(draft.getByText("Borrador", { exact: true })).toBeVisible({ timeout: 10000 });

    // Delete (confirm dialog) → back to empty.
    await draft.getByTitle("Eliminar").click();
    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.locator("body")).toContainText("Aún no hay campañas", { timeout: 10000 });
  });
});
