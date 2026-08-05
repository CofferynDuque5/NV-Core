import { expect, test, type Page } from "@playwright/test";

const email = `e2e_media_${Date.now()}@nv.tv`;
const WS = "codigo-creativo";

async function register(page: Page) {
  await page.goto("/register", { waitUntil: "networkidle" });
  await page.fill("#name", "E2E Media");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.selectOption("#workspace", WS);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/w/${WS}/**`, { timeout: 20000 });
}

/**
 * Media Library E2E without external storage: exercises the search / empty /
 * filter UX that the RC marked premium. Uploads go to Cloudinary (not available
 * in CI), so this focuses on the deterministic parts: the empty state, the
 * "no results" state under a query, and clearing filters.
 */
test.describe.serial("media library", () => {
  test("empty → search yields 'no results' → clear restores empty", async ({ page }) => {
    await register(page);
    await page.goto(`/w/${WS}/biblioteca`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // Fresh workspace → empty library.
    await expect(page.locator("body")).toContainText("Biblioteca vacía");
    await expect(page.getByPlaceholder("Buscar por título…")).toBeVisible();

    // Type a query nothing matches → the empty state switches to "Sin resultados".
    await page.getByLabel("Buscar archivos").fill("zzz-inexistente");
    await expect(page.locator("body")).toContainText("Sin resultados", { timeout: 10000 });

    // Clearing filters returns to the base empty state.
    await page.getByRole("button", { name: "Limpiar filtros" }).click();
    await expect(page.locator("body")).toContainText("Biblioteca vacía", { timeout: 10000 });
  });
});
