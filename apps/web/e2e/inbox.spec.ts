import { expect, test, type Page } from "@playwright/test";

const email = `e2e_inbox_${Date.now()}@nv.tv`;
const WS = "software-studio";

async function register(page: Page) {
  await page.goto("/register", { waitUntil: "networkidle" });
  await page.fill("#name", "E2E Inbox");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.selectOption("#workspace", WS);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/w/${WS}/**`, { timeout: 20000 });
}

test.describe.serial("inbox", () => {
  test("create conversation → send message", async ({ page }) => {
    await register(page);
    await page.goto(`/w/${WS}/inbox`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(page.locator("body")).toContainText("Bandeja vacía");

    // New conversation
    await page.getByRole("button", { name: "Nueva conversación" }).first().click();
    await page.waitForSelector("#cv-name");
    await page.fill("#cv-name", "Cliente Uno");
    await page.selectOption("#cv-channel", "wa");
    await page.getByRole("button", { name: "Crear conversación" }).click();
    await expect(page.locator("body")).toContainText("Cliente Uno", { timeout: 10000 });

    // The thread opens (onCreated selects it) → send a message
    await page.waitForSelector('input[placeholder="Escribe una respuesta…"]', { timeout: 10000 });
    await page.fill('input[placeholder="Escribe una respuesta…"]', "Hola, ¿en qué puedo ayudarte?");
    await page.keyboard.press("Enter");
    await expect(page.locator("body")).toContainText("¿en qué puedo ayudarte?", { timeout: 10000 });

    // Resolve
    await page.getByRole("button", { name: "Resolver" }).click();
    await expect(page.getByRole("button", { name: "Reabrir" })).toBeVisible({ timeout: 10000 });
  });
});
