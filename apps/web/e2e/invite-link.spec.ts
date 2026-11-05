import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const ownerEmail = `e2e_enlace_owner_${stamp}@nv.tv`;
const mateEmail = `e2e_enlace_mate_${stamp}@nv.tv`;

test("team invite link: the owner shares a link, a teammate signs up through it and sees the same campaigns", async ({ page, browser }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Dueño", email: ownerEmail, password: PASSWORD, acceptTerms: true },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Enlace ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  expect(created.ok()).toBeTruthy();
  const { slug: WS } = (await created.json()) as { slug: string };
  const camp = await page.request.post(`${API}/workspaces/${WS}/campaigns`, {
    headers: auth,
    data: { name: "Campaña del equipo", message: "Hola equipo" },
  });
  expect(camp.ok()).toBeTruthy();

  // The owner creates the link in Configuración › Equipo.
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", ownerEmail);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);
  await page.goto(`/w/${WS}/configuracion?tab=equipo`, { waitUntil: "networkidle" });
  await page.getByTestId("invite-link-role").selectOption("Visor");
  await page.getByTestId("invite-link-create").click();
  const url = await page.getByTestId("invite-link-url").inputValue();
  expect(url).toContain("/join/");
  await expect(page.getByTestId("invite-link-row")).toHaveCount(1);

  // A teammate with no account opens it in another browser.
  const ctx = await browser.newContext();
  const mate = await ctx.newPage();
  await mate.goto(`/join/${url.split("/join/")[1]}`, { waitUntil: "networkidle" });
  await expect(mate.getByTestId("join-preview")).toContainText(`Enlace ${stamp}`);
  await expect(mate.getByTestId("join-preview")).toContainText("Visor");
  await mate.getByRole("link", { name: "Crear mi cuenta y unirme" }).click();
  await mate.fill("#name", "E2E Compañera");
  await mate.fill("#email", mateEmail);
  await mate.fill("#password", PASSWORD);
  await mate.check("#accept-terms");
  await mate.click('button[type="submit"]');
  await mate.waitForURL(/\/join\//, { timeout: 20000 });
  await mate.getByTestId("join-accept").click();
  await mate.waitForURL(`**/w/${WS}/campanas`, { timeout: 20000 });
  await expect(mate.locator("body")).toContainText("Campaña del equipo", { timeout: 10000 });
  await ctx.close();

  // The owner sees the use counted.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("invite-link-row")).toContainText("usado 1");
});
