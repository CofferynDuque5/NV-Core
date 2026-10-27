import { expect, test } from "@playwright/test";

import { registerInto } from "./helpers";

const WS = "fitness";

test("automation template: created paused and opened in the editor", async ({ page }) => {
  await registerInto(page, { name: "E2E Plantillas", email: `e2e_tpl_${Date.now()}@nv.tv`, workspace: WS });
  await page.goto(`/w/${WS}/automatizaciones`, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Plantillas" }).first().click();
  const list = page.getByTestId("automation-templates");
  await expect(list).toContainText("Bienvenida a quien escribe por primera vez");
  await expect(list).toContainText("Necesita: WhatsApp o Telegram conectado");
  await page.getByRole("button", { name: "Usar Bienvenida a quien escribe por primera vez" }).click();

  // The editor opens on the new flow, with the template's steps.
  await expect(page.getByRole("heading", { name: "Bienvenida a quien escribe por primera vez" })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator("body")).toContainText("Mensaje de bienvenida");
  await expect(page.locator("body")).toContainText("Es un contacto nuevo");

  // Back in the list it is paused: nothing runs until someone activates it.
  await page.getByRole("button", { name: "Volver a la lista" }).click();
  const row = page.locator("body");
  await expect(row).toContainText("Bienvenida a quien escribe por primera vez");
  await expect(row).toContainText(/pausad/i);

  // The "gone quiet" template uses the inactive-contact trigger, also paused.
  await page.getByRole("button", { name: "Plantillas" }).first().click();
  await expect(list).toContainText("Reactivar a quien dejó de escribir");
  await page.getByRole("button", { name: "Usar Reactivar a quien dejó de escribir" }).click();
  await expect(page.getByRole("heading", { name: "Reactivar a quien dejó de escribir" })).toBeVisible({ timeout: 10000 });
  await expect(page.locator("body")).toContainText("30 días sin escribir");
  await expect(page.locator("body")).toContainText("Mensaje para retomar");
});
