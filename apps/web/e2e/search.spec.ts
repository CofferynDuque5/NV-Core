import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_buscador_${stamp}@nv.tv`;

test("buscador: filtros, vista previa sin tildes y abre el contacto o el chat", async ({
  page,
}) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Buscador", email, password: PASSWORD, acceptTerms: true },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const H = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: H,
    data: { name: `Buscador ${stamp}` },
  });
  expect(created.ok()).toBeTruthy();
  const { slug: WS } = (await created.json()) as { slug: string };
  const contact = await page.request.post(`${API}/workspaces/${WS}/contacts`, {
    headers: H,
    data: { name: "Ramona Díaz", phone: "+58 412 000 1122", stage: "Cliente", tags: ["VIP"] },
  });
  expect(contact.ok()).toBeTruthy();
  const conv = await page.request.post(`${API}/workspaces/${WS}/inbox/conversations`, {
    headers: H,
    data: { channel: "wa", contactName: "Ramona Díaz", contactHandle: "584120001122" },
  });
  expect(conv.ok()).toBeTruthy();
  const { id: convId } = (await conv.json()) as { id: string };

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);
  await page.goto(`/w/${WS}/dashboard`, { waitUntil: "networkidle" });

  // Ctrl+K opens it with quick actions; typing without the accent finds both.
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("command-palette");
  await expect(palette).toContainText("Acciones rápidas");
  await page.keyboard.type("ramona diaz");
  await expect(page.getByTestId("search-result-contact")).toHaveCount(1, { timeout: 10000 });
  await expect(page.getByTestId("search-result-conversation")).toHaveCount(1);
  await expect(palette.locator("mark").first()).toHaveText("Ramona");

  // The preview shows the selected contact's card.
  await expect(page.getByTestId("search-preview")).toContainText("+58 412 000 1122");

  // Filters: Tab moves to «Contactos», then «Conversaciones».
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("search-filter-contact")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("search-filter-conversation")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("search-result-contact")).toHaveCount(0);

  // Enter opens that chat in the Inbox.
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/w/${WS}/inbox?c=${convId}`);
  await expect(page.locator("body")).toContainText("Ramona Díaz");

  // Next time it remembers the search; opening the contact shows its card.
  await page.keyboard.press("Control+k");
  await expect(palette).toContainText("ramona diaz");
  await expect(palette).toContainText("Abiertos hace poco");
  await page.keyboard.type("ramona");
  await expect(page.getByTestId("search-result-contact")).toHaveCount(1, { timeout: 10000 });
  await page.getByTestId("search-result-contact").click();
  await page.waitForURL(new RegExp(`/w/${WS}/contactos\\?`));
  await expect(page.getByRole("dialog")).toContainText("Ramona Díaz", { timeout: 10000 });
});
