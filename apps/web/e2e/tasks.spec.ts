import { expect, test } from "@playwright/test";

import { registerInto } from "./helpers";

const email = `e2e_tasks_${Date.now()}@nv.tv`;
const WS = "ai-automation-studio";

test("task board: create, move to done, persist, delete", async ({ page }) => {
  await registerInto(page, { name: "E2E Tareas", email, workspace: WS });
  await page.goto(`/w/${WS}/tareas`, { waitUntil: "networkidle" });
  await expect(page.locator("body")).toContainText("Aún no hay tareas", { timeout: 10000 });

  // Create, assigned to myself.
  await page.getByRole("button", { name: "Nueva tarea" }).first().click();
  await page.fill("#tk-title", "Grabar el reel del lanzamiento");
  await page.selectOption("#tk-priority", "high");
  await page.selectOption("#tk-assignee", email);
  await page.getByRole("button", { name: "Crear tarea" }).click();
  const todo = page.getByTestId("task-column-todo");
  await expect(todo).toContainText("Grabar el reel del lanzamiento", { timeout: 10000 });
  await expect(todo).toContainText("Alta");

  // Move it to "Hecha" from the edit dialog.
  await todo.getByTestId("task-card").first().click();
  await page.selectOption("#tk-status", "done");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const done = page.getByTestId("task-column-done");
  await expect(done).toContainText("Grabar el reel del lanzamiento", { timeout: 10000 });

  // "Mis tareas" keeps it; it survives a reload.
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Responsable").selectOption("me");
  await expect(page.getByTestId("task-column-done")).toContainText("Grabar el reel del lanzamiento");

  // Delete (confirm dialog).
  await page.getByTestId("task-column-done").getByTestId("task-card").first().click();
  await page.getByRole("button", { name: "Eliminar tarea" }).click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.locator("body")).toContainText("Aún no hay tareas", { timeout: 10000 });
});
