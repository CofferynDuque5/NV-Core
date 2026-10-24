import { expect, test, type Page } from "@playwright/test";

import { registerInto } from "./helpers";

const email = `e2e_smoke_${Date.now()}@nv.tv`;
const WS = "design-your-core";

/** Every workspace module route (mirrors app-routes.tsx / the sidebar nav). */
const ROUTES = [
  "dashboard",
  "calendario",
  "campanas",
  "contactos",
  "grupos",
  "segmentos",
  "inbox",
  "builder",
  "ai",
  "plantillas",
  "biblioteca",
  "automatizaciones",
  "analytics",
  "marketplace",
  "conexiones",
  "configuracion",
  "historial",
];

async function register(page: Page) {
  await registerInto(page, { name: "E2E Smoke", email, workspace: WS });
}

/**
 * Route smoke — the per-module coverage backstop the RC asked for (#16): every
 * module route must mount without a hard crash (no uncaught page error, the
 * lazy chunk resolves, the <main> landmark renders, no app-level error
 * boundary). Navigation is client-side via the sidebar (one SPA boot, not 17
 * hard reloads) — faster, and it also exercises the real in-app nav path.
 */
test.describe.serial("route smoke", () => {
  test.setTimeout(90_000);

  test("all module routes mount without crashing", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await register(page);
    // The desktop sidebar (<aside>, hidden below lg) holds the nav links.
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    for (const route of ROUTES) {
      const before = pageErrors.length;
      await sidebar.locator(`a[href="/w/${WS}/${route}"]`).click();
      await page.waitForURL(`**/w/${WS}/${route}`, { timeout: 15000 });

      // Landmark present + resolved to real content (Suspense fallback gone).
      await expect(page.locator("#main-content")).toBeVisible({ timeout: 15000 });
      await expect(page.locator("#main-content")).not.toBeEmpty();
      // No app-level error boundary rendered on the page.
      await expect(page.locator("body")).not.toContainText("Algo salió mal");
      expect(pageErrors.slice(before), `uncaught error on /${route}`).toEqual([]);
    }
  });
});
