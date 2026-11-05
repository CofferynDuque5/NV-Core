import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_tanda4_${stamp}@nv.tv`;

/** Stand-in for 40 quiet days and a failed send (no real WhatsApp here). */
function ageGroup(groupId: string): void {
  const script = `
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    const [id] = process.argv.slice(1);
    (async () => {
      const g = await p.group.update({ where: { id }, data: { watchedSince: new Date(Date.now() - 40 * 86400000) } });
      await p.sendLog.create({ data: { workspaceSlug: g.workspaceSlug, groupId: id, groupName: g.name, ok: false, error: "prueba" } });
      await p.$disconnect();
    })();
  `;
  execFileSync("node", ["-e", script, groupId], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../api"),
    env: process.env,
  });
}

test("grupos sin actividad, último envío y confirmar varios cobros a la vez", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to simulate 40 quiet days");
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Tanda4", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Tanda4 ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };

  const dormido = await page.request.post(`${API}/workspaces/${WS}/groups`, { headers: auth, data: { name: "Grupo dormido", channel: "wa" } });
  expect(dormido.status()).toBe(201);
  await page.request.post(`${API}/workspaces/${WS}/groups`, { headers: auth, data: { name: "Grupo activo", channel: "wa" } });
  ageGroup(((await dormido.json()) as { id: string }).id);

  // Two payments the customers say they already paid.
  for (const [concept, ref] of [["Plan 1 mes", "A1"], ["Plan 3 meses", "B2"]]) {
    const p = await page.request.post(`${API}/workspaces/${WS}/payments`, {
      headers: auth,
      data: { concept, amount: 10, currency: "USD" },
    });
    const { id } = (await p.json()) as { id: string };
    const up = await page.request.patch(`${API}/workspaces/${WS}/payments/${id}`, {
      headers: auth,
      data: { status: "por_verificar", reference: ref },
    });
    expect(up.status()).toBe(200);
  }

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);

  await page.goto(`/w/${WS}/grupos`, { waitUntil: "networkidle" });
  const row = page.getByTestId("group-row").filter({ hasText: "Grupo dormido" });
  await expect(row.getByTestId("group-activity")).toContainText("Último envío");
  await expect(row.getByTestId("group-activity")).toContainText("(falló)");
  await expect(row.getByTestId("group-activity")).toContainText("Sin actividad 30 d");
  if (process.env.E2E_SHOTS) {
    await page.setViewportSize({ width: 1600, height: 800 });
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda4-grupos.png` });
  }
  await page.getByRole("button", { name: "Sin actividad" }).click();
  await expect(page.getByTestId("group-row")).toHaveCount(1);

  await page.goto(`/w/${WS}/cobros`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("payment-pick")).toHaveCount(2);
  await page.getByLabel("Seleccionar todos los por verificar").check();
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda4-cobros.png` });
  await page.getByTestId("bulk-verify-confirm").click();
  await page.getByRole("button", { name: "Sí, los recibí" }).click();
  await expect(page.locator("body")).toContainText("2 pagos confirmados", { timeout: 10000 });
  await expect(page.getByTestId("payment-pick")).toHaveCount(0);
  const list = await page.request.get(`${API}/workspaces/${WS}/payments`, { headers: auth });
  const items = (await list.json()) as { status: string }[];
  expect(items.map((p) => p.status)).toEqual(["pagado", "pagado"]);
});
