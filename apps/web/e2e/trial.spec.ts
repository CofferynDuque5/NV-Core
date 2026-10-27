import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

// The operator's own brand that receives plan payments (NV_BILLING_WORKSPACE).
// Every built-in brand is already claimed by another spec, so the operator
// creates it ("NV Cobros" → slug nv-cobros on a fresh database).
const OPERATOR = process.env.NV_BILLING_WORKSPACE ?? "nv-cobros";

/** Move the brand's trial end into the past (stands in for 24 h going by). */
function endTrial(slug: string): void {
  const script = `
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    p.workspaceAccess
      .update({ where: { workspaceSlug: process.argv[1] }, data: { trialEndsAt: new Date(Date.now() - 60000) } })
      .then(() => p.$disconnect());
  `;
  execFileSync("node", ["-e", script, slug], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../api"), env: process.env });
}

async function register(page: import("@playwright/test").Page, name: string, email: string, workspaceSlug?: string) {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name, email, password: PASSWORD, acceptTerms: true, ...(workspaceSlug ? { workspaceSlug } : {}) },
  });
  expect(res.ok(), `register ${email} → ${res.status()}`).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
}

test("24 h free trial: banner, lock when it ends, manual plan payment, unlocked when confirmed", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL to simulate the end of the trial");
  const stamp = Date.now();

  // The operator: their billing brand with one active payment method.
  const op = await register(page, "NV Operador", `e2e_operador_${stamp}@nv.tv`);
  const billing = await page.request.post(`${API}/workspaces`, { headers: op, data: { name: "NV Cobros" } });
  expect(billing.ok()).toBeTruthy();
  expect(((await billing.json()) as { slug: string }).slug).toBe(OPERATOR);
  const method = await page.request.post(`${API}/workspaces/${OPERATOR}/payments/methods`, {
    headers: op,
    data: { kind: "binance_pay", label: "Binance Pay NV", currency: "USDT", details: { payId: "555666777" } },
  });
  expect(method.ok(), await method.text()).toBeTruthy();

  // A customer signs up and creates their own brand → 24 h trial.
  const email = `e2e_prueba_${stamp}@nv.tv`;
  const me = await register(page, "Cliente Prueba", email);
  const created = await page.request.post(`${API}/workspaces`, {
    headers: me,
    data: { name: `Café Prueba ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  expect(created.ok()).toBeTruthy();
  const { slug } = (await created.json()) as { slug: string };

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);
  await page.goto(`/w/${slug}/contactos`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("trial-banner")).toContainText(/te quedan (23|24) h/);

  // The trial ends: the panel locks and shows how to pay.
  endTrial(slug);
  // The server remembers a brand's access for up to 30 s.
  await expect
    .poll(async () => (await page.request.get(`${API}/workspaces/${slug}/contacts`, { headers: me })).status(), {
      timeout: 40_000,
      intervals: [2_000],
    })
    .toBe(402);
  await page.reload({ waitUntil: "networkidle" });
  const lock = page.getByTestId("plan-lock");
  await expect(lock).toContainText("Tu prueba gratis de 24 horas terminó");
  await expect(lock).toContainText("US$ 19");
  await expect(lock).toContainText("555666777");

  await lock.locator("#plan-reference").fill("BP-778899");
  await lock.getByRole("button", { name: "Enviar pago para verificar" }).click();
  await expect(lock).toContainText("Estamos verificando tu pago");
  await expect(page.getByTestId("plan-payment")).toContainText("Por verificar");

  // The operator sees it in their Cobros and confirms it after checking the account.
  const list = await page.request.get(`${API}/workspaces/${OPERATOR}/payments?status=por_verificar`, { headers: op });
  const pending = ((await list.json()) as { id: string; concept: string; reference?: string }[]).find(
    (p) => p.reference === "BP-778899",
  );
  expect(pending?.concept).toContain(slug);
  const ok = await page.request.patch(`${API}/workspaces/${OPERATOR}/payments/${pending!.id}`, {
    headers: op,
    data: { status: "pagado" },
  });
  expect(ok.ok()).toBeTruthy();

  // Confirming clears the server's memory of the brand at once.
  await expect
    .poll(async () => (await page.request.get(`${API}/workspaces/${slug}/contacts`, { headers: me })).status(), {
      timeout: 10_000,
    })
    .toBe(200);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("plan-lock")).toHaveCount(0);
  await expect(page.getByTestId("trial-banner")).toHaveCount(0);
});
