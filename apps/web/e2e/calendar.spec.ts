import { expect, test, type Page } from "@playwright/test";

import { registerInto } from "./helpers";

const email = `e2e_cal_${Date.now()}@nv.tv`;
const WS = "marketing-studio";

async function register(page: Page) {
  await registerInto(page, { name: "E2E Cal", email, workspace: WS });
}

test.describe.serial("calendar", () => {
  test("schedule a post → shows on the month grid", async ({ page }) => {
    await register(page);
    await page.goto(`/w/${WS}/calendario`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    // Month view so a mid-month date is always within the visible grid (the
    // default view is week, which may not contain the 15th).
    await page.getByRole("tab", { name: "Mes" }).click();

    await page.getByRole("button", { name: "Programar" }).first().click();
    await page.waitForSelector("#p-title");
    await page.fill("#p-title", "Reel de lanzamiento");
    await page.selectOption("#p-channel", "ig");

    // Pick the 15th of the currently shown month.
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
    await page.fill("#p-date", day);
    await page.click('button[type="submit"]');

    await expect(page.locator("body")).toContainText("Reel de lanzamiento", { timeout: 10000 });

    // Persists across reload (view resets to default → switch back to month).
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.getByRole("tab", { name: "Mes" }).click();
    await expect(page.locator("body")).toContainText("Reel de lanzamiento");
  });
});
