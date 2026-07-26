import { expect, test } from "@playwright/test";

const email = `e2e_auth_${Date.now()}@nv.tv`;
const password = "password123";
const WS = "nv-stream"; // distinct workspace so specs stay independent

test.describe.serial("auth", () => {
  test("register → dashboard, memory token, httpOnly cookie", async ({ page }) => {
    await page.goto("/register", { waitUntil: "networkidle" });
    await page.fill("#name", "E2E Auth");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.selectOption("#workspace", WS);
    await page.click('button[type="submit"]');
    await page.waitForURL(`**/w/${WS}/**`, { timeout: 20000 });

    // Access token in memory, not localStorage.
    expect(await page.evaluate(() => window.localStorage.getItem("nv.token"))).toBeNull();
    // Refresh cookie is httpOnly (not visible to JS).
    expect(await page.evaluate(() => document.cookie)).not.toContain("nv_refresh");
    expect(await page.textContent("body")).toContain("E2E Auth");
  });

  test("session restored via refresh cookie on reload", async ({ page }) => {
    // Log in fresh (new context each test) then reload.
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`**/w/${WS}/**`, { timeout: 20000 });

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    expect(page.url()).toContain(`/w/${WS}`);
    expect(await page.textContent("body")).toContain("E2E Auth");
  });

  test("wrong password shows an error", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill("#email", email);
    await page.fill("#password", "wrongwrong");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    expect(page.url()).toContain("/login");
    expect(await page.textContent("body")).toMatch(/inválid|Credenciales/i);
  });

  test("unauthenticated access redirects to /login", async ({ page }) => {
    await page.goto(`/w/${WS}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForURL("**/login", { timeout: 15000 }).catch(() => undefined);
    expect(page.url()).toContain("/login");
  });
});
