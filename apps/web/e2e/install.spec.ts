import { expect, test } from "@playwright/test";

test("instalar: the website's download link shows the steps for the chosen device", async ({ page }) => {
  await page.goto("/instalar?so=ios", { waitUntil: "networkidle" });
  await expect(page.getByTestId("install-page")).toBeVisible();
  await expect(page.getByRole("tab", { name: /iPhone y iPad/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Añadir a pantalla de inicio", { exact: false })).toBeVisible();

  await page.getByRole("tab", { name: /Windows/ }).click();
  await expect(page.getByText("menú Inicio", { exact: false })).toBeVisible();

  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.screenshots.length).toBeGreaterThan(1);
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toContain("/?ir=inbox");
});
