import { expect, test } from "@playwright/test";

const email = `e2e_auth_${Date.now()}@nv.tv`;
const password = "password123";
// Set by the first test: the slug of the workspace created in onboarding.
let WS = "";

test.describe.serial("auth", () => {
  test("register → onboarding → dashboard, memory token, httpOnly cookie", async ({ page }) => {
    await page.goto("/register", { waitUntil: "networkidle" });
    await page.fill("#name", "E2E Auth");
    await page.fill("#email", email);
    await page.fill("#password", password);
    // The legal terms must be accepted: the browser blocks the form until then.
    await expect(page.locator("#accept-terms")).toHaveAttribute("required", "");
    await expect(page.getByRole("link", { name: "Términos y condiciones" })).toHaveAttribute("href", /legal\.html#terminos$/);
    await page.check("#accept-terms");
    await page.click('button[type="submit"]');
    // A new account has no workspace yet: it goes to the guided setup.
    await page.waitForURL("**/onboarding", { timeout: 20000 });

    // Access token in memory, not localStorage.
    expect(await page.evaluate(() => window.localStorage.getItem("nv.token"))).toBeNull();
    // Refresh cookie is httpOnly (not visible to JS).
    expect(await page.evaluate(() => document.cookie)).not.toContain("nv_refresh");

    // Onboarding: category (default) → name → goals (optional) → create.
    await page.getByRole("button", { name: /Continuar/ }).click();
    await page.fill("#ob-name", `E2E Auth ${Date.now()}`);
    await page.getByRole("button", { name: /Continuar/ }).click();
    await page.getByRole("button", { name: /Crear mi workspace/ }).click();
    await page.waitForURL("**/w/*/dashboard", { timeout: 20000 });
    WS = new URL(page.url()).pathname.split("/")[2]!;
    expect(WS).toBeTruthy();
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
    await page.goto(`/w/${WS || "nv-stream"}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForURL("**/login", { timeout: 15000 }).catch(() => undefined);
    expect(page.url()).toContain("/login");
  });
});
