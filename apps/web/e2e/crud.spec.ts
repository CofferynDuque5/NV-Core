import { expect, test, type Page } from "@playwright/test";

const email = `e2e_crud_${Date.now()}@nv.tv`;
const password = "password123";
const WS = "nv-streaming";

async function register(page: Page) {
  await page.goto("/register", { waitUntil: "networkidle" });
  await page.fill("#name", "E2E Crud");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.selectOption("#workspace", WS);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/w/${WS}/**`, { timeout: 20000 });
}

test.describe.serial("contacts CRUD", () => {
  test("create → edit → delete a contact", async ({ page }) => {
    await register(page);

    await page.goto(`/w/${WS}/contactos`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(page.locator("body")).toContainText("Tu CRM está vacío");

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
    await expect(page.locator("body")).toContainText("Tu CRM está vacío", { timeout: 10000 });
  });
});
