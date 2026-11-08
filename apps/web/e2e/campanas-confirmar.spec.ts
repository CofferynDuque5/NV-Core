import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_confirmar_${stamp}@nv.tv`;

/** HH:MM a few minutes from now in the brand's zone (unset → America/Caracas). */
function inMinutes(min: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Caracas",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(Date.now() + min * 60_000));
}

test("aviso antes de enviar: Confirmar envío / No enviar desde la campanita y la campaña", async ({ page }) => {
  test.setTimeout(150_000);
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Confirmar", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Confirmar ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };
  const ids: string[] = [];
  for (const name of ["Ventas Caracas", "Ofertas Maracay"]) {
    const g = await page.request.post(`${API}/workspaces/${WS}/groups`, { headers: auth, data: { name, members: 40 } });
    ids.push(((await g.json()) as { id: string }).id);
  }

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  // 1. The setting: only send when confirmed, notice 20 minutes before.
  await page.goto(`/w/${WS}/grupos`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Horario de envío" }).click();
  await page.selectOption("#sh-confirm", "require");
  await page.getByLabel("Minutos antes").fill("20");
  if (process.env.E2E_SHOTS) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/confirmar-ajuste.png` });
  }
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const settings = await page.request.get(`${API}/workspaces/${WS}/groups/send-settings`, { headers: auth });
  expect(await settings.json()).toMatchObject({ sendConfirm: "require", sendConfirmLeadMin: 20 });

  // 2. Two daily campaigns due in ~8 minutes: the notice arrives on the next tick.
  for (const name of ["Promo mañana", "Promo tarde"]) {
    const camp = await page.request.post(`${API}/workspaces/${WS}/campaigns`, {
      headers: auth,
      data: { name, message: "Hola {{grupo}}", scheduleType: "daily", scheduleTimes: [inMinutes(8)], targetGroups: ids },
    });
    expect(camp.status()).toBe(201);
  }
  await page.goto(`/w/${WS}/campanas`, { waitUntil: "networkidle" });

  // The pop-up shows up by itself (notifications refresh every 30 s).
  const popup = page.locator("[data-sonner-toast]").filter({ hasText: "Promo mañana" });
  await expect(popup).toBeVisible({ timeout: 100_000 });
  await expect(popup.getByRole("button", { name: "Confirmar envío" })).toBeVisible();
  await expect(popup.getByRole("button", { name: "No enviar" })).toBeVisible();
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/confirmar-ventana.png` });

  // 3. «No enviar» from the campaign card.
  await page.reload({ waitUntil: "networkidle" });
  const tarde = page.getByTestId("campaign-row").filter({ hasText: "Promo tarde" });
  await expect(tarde.getByTestId("campaign-confirm")).toContainText("esperando tu respuesta", { timeout: 40_000 });
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/confirmar-tarjeta.png` });
  await tarde.getByRole("button", { name: "No enviar" }).click();
  await expect(tarde.getByTestId("send-confirm-answer")).toContainText("No se enviará");

  // 4. «Confirmar envío» from the bell panel.
  await page.getByRole("button", { name: /Notificaciones/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Solo sale si pulsas «Confirmar envío».");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/confirmar-campanita.png` });
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar envío" }).first().click();
  await expect(page.getByRole("dialog").getByTestId("send-confirm-answer").first()).toBeVisible();

  const list = (await (await page.request.get(`${API}/workspaces/${WS}/campaigns`, { headers: auth })).json()) as {
    items: Array<{ name: string; confirmState: string | null }>;
  };
  expect(list.items.find((c) => c.name === "Promo mañana")?.confirmState).toBe("confirmed");
  expect(list.items.find((c) => c.name === "Promo tarde")?.confirmState).toBe("skipped");

  // A stale answer (other slot) is refused.
  const camp = list.items.find((c) => c.name === "Promo mañana") as unknown as { id: string };
  const stale = await page.request.post(`${API}/workspaces/${WS}/campaigns/${camp.id}/confirm-send`, {
    headers: auth,
    data: { slot: "2000-01-01T00:00", decision: "skip" },
  });
  expect(stale.status()).toBe(409);
});
