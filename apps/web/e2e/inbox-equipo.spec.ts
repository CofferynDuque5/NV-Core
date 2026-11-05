import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_inbox_eq_${stamp}@nv.tv`;

/** A customer message that arrived two hours ago (stands in for WhatsApp). */
function inboundTwoHoursAgo(conversationId: string): void {
  const script = `
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    p.message
      .create({ data: { conversationId: process.argv[1], direction: "in", text: "¿Tienen envío a Valencia?", createdAt: new Date(Date.now() - 2 * 3600000) } })
      .then(() => p.$disconnect());
  `;
  execFileSync("node", ["-e", script, conversationId], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../api"),
    env: process.env,
  });
}

test("Inbox en equipo: sin responder, tomar el chat y notas internas", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to simulate an incoming message");
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Inbox", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Inbox ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };
  const conv = await page.request.post(`${API}/workspaces/${WS}/inbox/conversations`, {
    headers: auth,
    data: { channel: "wa", contactName: "Lucía Pérez", contactHandle: "584121110000" },
  });
  const { id } = (await conv.json()) as { id: string };
  inboundTwoHoursAgo(id);

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  await page.goto(`/w/${WS}/inbox`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("inbox-waiting-count")).toHaveText("1");
  await page.getByTestId("inbox-filter-waiting").click();
  const row = page.getByTestId("inbox-conversation").filter({ hasText: "Lucía Pérez" });
  await expect(row.getByTestId("inbox-wait")).toHaveText(/Espera 2 h/);

  await row.click();
  await page.getByTestId("inbox-take").click();
  await expect(page.getByLabel("Asignar responsable")).toHaveValue(email);
  await page.getByTestId("inbox-filter-mine").click();
  await expect(page.getByTestId("inbox-conversation")).toHaveCount(1);

  // Internal note: shown in the thread, not sent, the chat keeps waiting.
  await page.getByTestId("inbox-note-mode").click();
  await page.getByLabel("Nota interna").fill("Le prometí el precio con envío hoy");
  await page.getByRole("button", { name: "Guardar nota" }).click();
  await expect(page.getByTestId("inbox-note")).toContainText("Le prometí el precio con envío hoy");
  await expect(page.getByTestId("inbox-note")).toContainText("el cliente no la ve");
  await expect(row).toContainText("¿Tienen envío a Valencia?");
  await expect(page.getByTestId("inbox-waiting-count")).toHaveText("1");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/inbox-equipo.png` });

  const list = await page.request.get(`${API}/workspaces/${WS}/inbox/conversations?waiting=true`, { headers: auth });
  const body = (await list.json()) as { items: { assignee?: string }[]; waitingCount: number };
  expect(body.waitingCount).toBe(1);
  expect(body.items[0]?.assignee).toBe(email);
});
