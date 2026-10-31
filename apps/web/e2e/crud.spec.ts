import { expect, test, type Page } from "@playwright/test";

import { registerInto } from "./helpers";

const email = `e2e_crud_${Date.now()}@nv.tv`;
const WS = "nv-streaming";

async function register(page: Page) {
  await registerInto(page, { name: "E2E Crud", email, workspace: WS });
}

test.describe.serial("contacts CRUD", () => {
  test("create → edit → delete a contact", async ({ page }) => {
    await register(page);

    await page.goto(`/w/${WS}/contactos`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(page.locator("body")).toContainText("Aún no tienes contactos");

    // The default view is the Kanban board; the per-row Editar/Eliminar actions
    // live in the Tabla (table) view, so switch to it before editing rows.
    await page.getByRole("tab", { name: "Tabla" }).click();

    // Create
    await page.getByRole("button", { name: "Nuevo", exact: true }).first().click();
    await page.waitForSelector("#c-name");
    await page.fill("#c-name", "María González");
    await page.selectOption("#c-stage", "Lead");
    await page.getByRole("button", { name: "Crear contacto" }).click();
    await expect(page.locator("body")).toContainText("María González", { timeout: 10000 });

    // Edit
    await page.click('button[title="Editar"]');
    await page.waitForSelector("#c-name");
    expect(await page.inputValue("#c-name")).toBe("María González");
    await page.fill("#c-name", "María G. (VIP)");
    await page.selectOption("#c-stage", "Cliente");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.locator("body")).toContainText("María G. (VIP)", { timeout: 10000 });
    await expect(page.locator("body")).toContainText("Cliente");

    // Persist across reload (view resets to board → switch back to table).
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.getByRole("tab", { name: "Tabla" }).click();
    await expect(page.locator("body")).toContainText("María G. (VIP)");

    // Delete (confirm dialog)
    await page.click('button[title="Eliminar"]');
    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.locator("body")).toContainText("Aún no tienes contactos", { timeout: 10000 });
  });
});
