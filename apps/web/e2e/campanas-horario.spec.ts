import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_horario_${stamp}@nv.tv`;

test("horario de envío de la marca, horario y máximo por grupo, y envío por lotes", async ({ page }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Horario", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Horario ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };
  const ids: string[] = [];
  for (const name of ["Ventas Caracas", "Ofertas Maracay", "Clientes VIP"]) {
    const g = await page.request.post(`${API}/workspaces/${WS}/groups`, { headers: auth, data: { name, members: 40 } });
    ids.push(((await g.json()) as { id: string }).id);
  }

  // Only one end of the window is rejected.
  const half = await page.request.put(`${API}/workspaces/${WS}/groups/send-settings`, {
    headers: auth,
    data: { sendFrom: "08:00", sendUntil: null },
  });
  expect(half.status()).toBe(400);

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);
  await page.goto(`/w/${WS}/grupos`, { waitUntil: "networkidle" });

  // 1. Brand hours: 08:00 to 21:00, at most 2 campaign messages per group a day.
  await page.getByRole("button", { name: "Horario de envío" }).click();
  await page.fill("#sh-from", "08:00");
  await page.fill("#sh-until", "21:00");
  await page.fill("#sh-max", "2");
  if (process.env.E2E_SHOTS) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda7-horario.png` });
  }
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const settings = await page.request.get(`${API}/workspaces/${WS}/groups/send-settings`, { headers: auth });
  expect(await settings.json()).toMatchObject({ sendFrom: "08:00", sendUntil: "21:00", groupMaxPerDay: 2 });

  // 2. One group with its own hours (late night) and its own daily maximum.
  const row = page.getByTestId("group-row").filter({ hasText: "Clientes VIP" });
  await row.getByRole("button", { name: "Configurar" }).click();
  await page.fill("#gr-from", "20:00");
  await page.fill("#gr-until", "23:30");
  await page.fill("#gr-max", "1");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda7-grupo.png` });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row.getByTestId("group-hours")).toContainText("Envía 20:00–23:30 · máx. 1/día");

  // 3. A daily campaign at 22:00: two groups wait for their hour; send in batches.
  const camp = await page.request.post(`${API}/workspaces/${WS}/campaigns`, {
    headers: auth,
    data: {
      name: "Promo nocturna",
      message: "Hola {{grupo}}",
      scheduleType: "daily",
      scheduleTimes: ["22:00"],
      targetGroups: ids,
    },
  });
  expect(camp.status()).toBe(201);
  await page.goto(`/w/${WS}/campanas`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Editar Promo nocturna" }).click();
  await expect(page.getByTestId("outside-hours")).toContainText("2 grupos no reciben mensajes a las 22:00");
  await expect(page.getByTestId("outside-hours")).not.toContainText("Clientes VIP");
  const batches = page.getByTestId("campaign-batches");
  await batches.getByRole("checkbox").check();
  await batches.getByLabel("Grupos por lote").fill("2");
  await batches.getByLabel("Minutos de pausa").fill("15");
  if (process.env.E2E_SHOTS) {
    await batches.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda7-lotes.png` });
  }
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("campaign-row").filter({ hasText: "Promo nocturna" })).toContainText(
    "Lotes de 2 · pausa 15 min",
  );
  const list = (await (await page.request.get(`${API}/workspaces/${WS}/campaigns`, { headers: auth })).json()) as {
    items: Array<{ name: string; batchSize: number | null; batchPauseMin: number | null; pendingGroups: number }>;
  };
  expect(list.items.find((c) => c.name === "Promo nocturna")).toMatchObject({
    batchSize: 2,
    batchPauseMin: 15,
    pendingGroups: 0,
  });
});
