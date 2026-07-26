import { expect, test, type Page } from "@playwright/test";

const email = `e2e_cal_${Date.now()}@nv.tv`;
const WS = "marketing-studio";

async function register(page: Page) {
  await page.goto("/register", { waitUntil: "networkidle" });
  await page.fill("#name", "E2E Cal");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.selectOption("#workspace", WS);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/w/${WS}/**`, { timeout: 20000 });
}

test.describe.serial("calendar", () => {
  test("schedule a post → shows on the month grid", async ({ page }) => {
    await register(page);
    await page.goto(`/w/${WS}/calendario`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

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

    // Persists across reload
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await expect(page.locator("body")).toContainText("Reel de lanzamiento");
  });
});
