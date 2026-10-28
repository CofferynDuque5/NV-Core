import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_inboxmeta_${stamp}@nv.tv`;

test("report counts Inbox conversations; Facebook and Instagram connect from one dialog", async ({ page }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Inbox", email, password: PASSWORD, acceptTerms: true },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Inbox ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  expect(created.ok()).toBeTruthy();
  const { slug: WS } = (await created.json()) as { slug: string };
  const conv = await page.request.post(`${API}/workspaces/${WS}/inbox/conversations`, {
    headers: auth,
    data: { channel: "wa", contactName: "Lucía", contactHandle: "+584125550001" },
  });
  expect(conv.ok()).toBeTruthy();

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  // Informe: the week's Inbox, and an honest answer to "is the panel worth it?".
  await page.goto(`/w/${WS}/informes`, { waitUntil: "networkidle" });
  const inbox = page.getByTestId("report-inbox");
  await expect(inbox).toContainText("¿El panel vale la pena?", { timeout: 10000 });
  await expect(inbox.getByTestId("inbox-verdict")).toHaveText(/Todavía no se nota el panel/);
  await expect(inbox).toContainText("0 de 1 conversaciones nuevas");
  await expect(inbox).toContainText("WhatsApp · 1");

  // Conexiones: Facebook + Instagram in one dialog, by picking a Page.
  await page.goto(`/w/${WS}/conexiones`, { waitUntil: "networkidle" });
  const card = page.getByTestId("meta-card");
  await expect(card).toContainText("Sin conectar");
  await card.getByRole("button", { name: "Conectar Facebook e Instagram" }).click();
  const dialog = page.getByRole("dialog", { name: "Conectar Facebook e Instagram" });
  // Without a Meta app on the server, it explains and offers the token path.
  await expect(dialog).toContainText("«Continuar con Facebook» se activa cuando el servidor tiene una app de Meta");
  await dialog.locator("#meta-token").fill("corto");
  await dialog.getByRole("button", { name: "Buscar mis páginas" }).click();
  await expect(dialog).toContainText("Pega el token completo");
  // The old form is still there for typing ids by hand.
  await dialog.getByRole("button", { name: "Avanzado: escribir los IDs a mano" }).click();
  await expect(page.getByRole("dialog", { name: "Conectar Facebook" })).toBeVisible();
});
