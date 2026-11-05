import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_campos_${stamp}@nv.tv`;

/** Today in the brands' default zone (no zone saved → Caracas). */
function todayDayMonth(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit" }).format(
    new Date(),
  );
  return parts; // «dd/mm»
}

test("campos personalizados, cumpleaños y acciones de segmento", async ({ page }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Campos", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Campos ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };
  await page.request.post(`${API}/workspaces/${WS}/contacts`, { headers: auth, data: { name: "Sin cumple" } });

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);
  await page.goto(`/w/${WS}/contactos`, { waitUntil: "networkidle" });

  // 1. Define two fields of the brand.
  await page.getByTestId("contacts-fields").click();
  await page.getByRole("button", { name: "Añadir campo" }).click();
  await page.getByLabel("Nombre del campo 1").fill("Ciudad");
  await page.getByRole("button", { name: "Añadir campo" }).click();
  await page.getByLabel("Nombre del campo 2").fill("Plan");
  await page.getByLabel("Tipo del campo 2").selectOption("select");
  await page.getByLabel("Opciones del campo 2").fill("Mensual, Anual");
  if (process.env.E2E_SHOTS) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda6-campos.png` });
  }
  await page.getByTestId("contact-fields-save").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 2. A contact with birthday today and both fields.
  await page.getByRole("button", { name: "Nuevo", exact: true }).first().click();
  await page.fill("#c-name", "Ana Cumple");
  await page.fill("#c-phone", "+58 412 123 4567");
  await page.fill("#c-birthday", `${todayDayMonth()}/1990`);
  await page.fill("#c-field-ciudad", "Maracay");
  await page.selectOption("#c-field-plan", "Anual");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda6-ficha.png` });
  await page.getByRole("button", { name: "Crear contacto" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const list = (await (await page.request.get(`${API}/workspaces/${WS}/contacts`, { headers: auth })).json()) as {
    items: Array<{ id: string; name: string; birthday?: string; custom?: Record<string, string>; tags: string[] }>;
  };
  const ana = list.items.find((c) => c.name === "Ana Cumple")!;
  expect(ana.birthday).toMatch(/^1990-\d{2}-\d{2}$/);
  expect(ana.custom).toEqual({ ciudad: "Maracay", plan: "Anual" });

  // The card says it is today.
  await page.getByText("Ana Cumple").first().click();
  await expect(page.getByTestId("contact-birthday")).toContainText("¡hoy!");
  await expect(page.getByRole("dialog")).toContainText("Maracay");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda6-cumple.png` });
  await page.keyboard.press("Escape");

  // 3. Segment «cumplen hoy»: tag everyone in it and see only them in Contactos.
  const seg = await page.request.post(`${API}/workspaces/${WS}/segments`, {
    headers: auth,
    data: { name: "Cumplen hoy", rules: [{ field: "birthday", operator: "birthday_in_days", value: "0" }] },
  });
  expect(seg.status()).toBe(201);
  await page.goto(`/w/${WS}/segmentos`, { waitUntil: "networkidle" });
  await expect(page.getByText("Cumple hoy", { exact: true })).toBeVisible();
  await expect(page.getByText("1 contacto", { exact: true })).toBeVisible();
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda6-segmento.png` });
  await page.getByRole("button", { name: "Etiquetar" }).click();
  await page.fill("#seg-tag-add", "cumple-hoy");
  await page.getByTestId("segment-tag-confirm").click();
  await expect(page.getByText("1 contacto actualizado")).toBeVisible();
  const after = (await (await page.request.get(`${API}/workspaces/${WS}/contacts`, { headers: auth })).json()) as typeof list;
  expect(after.items.find((c) => c.name === "Ana Cumple")!.tags).toEqual(["cumple-hoy"]);
  expect(after.items.find((c) => c.name === "Sin cumple")!.tags).toEqual([]);

  await page.getByRole("link", { name: "Ver contactos" }).click();
  await page.getByRole("tab", { name: "Tabla" }).click();
  await expect(page.getByLabel("Filtrar por segmento")).toHaveValue(/.+/);
  await expect(page.locator("body")).toContainText("Ana Cumple");
  await expect(page.locator("body")).not.toContainText("Sin cumple");
});
