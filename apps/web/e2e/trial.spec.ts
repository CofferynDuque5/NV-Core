import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

// The operator's own brand that receives plan payments (NV_BILLING_WORKSPACE).
// Every built-in brand is already claimed by another spec, so the operator
// creates it ("NV Cobros" → slug nv-cobros on a fresh database).
const OPERATOR = process.env.NV_BILLING_WORKSPACE ?? "nv-cobros";
// Platform admin (NV_SUPER_ADMINS in CI): approves plan payments.
const ADMIN = process.env.E2E_SUPER_ADMIN ?? "e2e_superadmin@nv.tv";
// A 1×1 PNG: the receipt.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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

/**
 * Sign the platform admin in (registering them the first time) on its own
 * request context, so the customer's session cookie in the page stays theirs.
 */
async function adminHeaders(request: import("@playwright/test").APIRequestContext) {
  const reg = await request.post(`${API}/auth/register`, {
    data: { name: "Admin Plataforma", email: ADMIN, password: PASSWORD, acceptTerms: true },
  });
  const res = reg.ok() ? reg : await request.post(`${API}/auth/login`, { data: { email: ADMIN, password: PASSWORD } });
  expect(res.ok(), `admin sign-in → ${res.status()}`).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
}

async function register(page: import("@playwright/test").Page, name: string, email: string, workspaceSlug?: string) {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name, email, password: PASSWORD, acceptTerms: true, ...(workspaceSlug ? { workspaceSlug } : {}) },
  });
  expect(res.ok(), `register ${email} → ${res.status()}`).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
}

test("24 h free trial: banner, lock when it ends, manual plan payment, unlocked when confirmed", async ({ page, playwright }) => {
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
  await expect(lock).toContainText("Tu prueba gratis terminó");
  // Both plans, with what each includes and the no-refunds notice.
  await expect(lock.getByTestId("plan-card-basico")).toContainText("US$ 7");
  await expect(lock.getByTestId("plan-card-basico")).toContainText("1 número de WhatsApp");
  await expect(lock.getByTestId("plan-card-pro")).toContainText("US$ 19");
  await expect(lock.getByTestId("plan-card-pro")).toContainText("Hasta 5 números de WhatsApp");
  await expect(lock.getByTestId("no-refunds")).toBeVisible();

  // Básico leaves out the Pro extras, and says so.
  await expect(lock.getByTestId("plan-card-basico").getByTestId("plan-excluded").first()).toContainText("Tienda");

  await lock.getByRole("button", { name: "Elegir Básico" }).click();
  await expect(lock.getByTestId("plan-checkout")).toContainText("Plan Básico");
  await expect(lock.getByTestId("plan-method-details")).toContainText("555666777");
  await lock.locator("#plan-reference").fill(`BP-${stamp}`);
  const send = lock.getByRole("button", { name: /Enviar pago de US\$ 7/ });
  // Payments are final, and need the payer details and the receipt.
  await lock.getByTestId("plan-accept-no-refunds").check();
  await expect(send).toBeDisabled();
  await lock.locator("#payer-payerName").fill("Cliente Prueba");
  await lock.locator("#payer-payerAccount").fill("cliente-binance");
  await expect(lock.locator("#payer-amountPaid")).toHaveValue(/7/);
  await expect(send).toBeDisabled();
  await lock.getByTestId("plan-receipt").setInputFiles({ name: "pago.png", mimeType: "image/png", buffer: PNG });
  await send.click();
  await expect(lock).toContainText("Estamos verificando tu pago");
  await expect(page.getByTestId("plan-payment")).toContainText("Por verificar");
  await expect(page.getByTestId("plan-payment")).toContainText("Plan Básico");

  // The operator's team sees it in Cobros; the platform admin reviews it in /admin.
  const list = await page.request.get(`${API}/workspaces/${OPERATOR}/payments?status=por_verificar`, { headers: op });
  const pending = ((await list.json()) as { id: string; concept: string; reference?: string }[]).find(
    (p) => p.reference === `BP-${stamp}`,
  );
  expect(pending?.concept).toContain(slug);
  expect(pending?.concept).toContain("Básico");
  // Only the platform admin can see plan payments and their receipts.
  expect((await page.request.get(`${API}/admin/plan-payments`, { headers: me })).status()).toBe(403);
  const adminRequest = await playwright.request.newContext();
  const admin = await adminHeaders(adminRequest);
  const reviews = (await (await page.request.get(`${API}/admin/plan-payments`, { headers: admin })).json()) as {
    id: string;
    payer: Record<string, string>;
    hasReceipt: boolean;
  }[];
  const review = reviews.find((r) => r.id === pending!.id);
  expect(review?.payer).toMatchObject({ payerName: "Cliente Prueba", payerAccount: "cliente-binance" });
  expect(review?.hasReceipt).toBe(true);
  const receipt = await page.request.get(`${API}/admin/plan-payments/${pending!.id}/receipt`, { headers: admin });
  expect(receipt.headers()["content-type"]).toContain("image/png");
  expect(receipt.headers()["x-content-type-options"]).toBe("nosniff");
  const ok = await page.request.post(`${API}/admin/plan-payments/${pending!.id}/approve`, { headers: admin, data: {} });
  expect(ok.ok(), await ok.text()).toBeTruthy();

  // Confirming clears the server's memory of the brand at once.
  await expect
    .poll(async () => (await page.request.get(`${API}/workspaces/${slug}/contacts`, { headers: me })).status(), {
      timeout: 10_000,
    })
    .toBe(200);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("plan-lock")).toHaveCount(0);
  await expect(page.getByTestId("trial-banner")).toHaveCount(0);

  // «Mi plan»: Básico is theirs, Pro is the upgrade.
  await page.goto(`/w/${slug}/plan`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("plan-card-basico")).toContainText("Tu plan");
  await expect(page.getByTestId("plan-card-pro").getByRole("button", { name: "Mejorar a Pro" })).toBeVisible();

  // Básico limits: one WhatsApp number and one brand.
  const line = await page.request.post(`${API}/workspaces/${slug}/whatsapp/lines`, { headers: me, data: { label: "Ventas" } });
  expect(line.status()).toBe(402);
  const second = await page.request.post(`${API}/workspaces`, { headers: me, data: { name: `Otra marca ${stamp}` } });
  expect(second.status()).toBe(402);
  expect(await second.text()).toContain("Mejora a Pro");

  // Básico leaves out Tienda, Cobros, Automatizaciones, Formularios and Embudos.
  for (const section of ["products", "payments", "automations", "forms", "funnels"]) {
    const res = await page.request.get(`${API}/workspaces/${slug}/${section}`, { headers: me });
    expect(res.status(), section).toBe(402);
    expect(await res.text()).toContain("plan_upgrade");
  }
  await page.goto(`/w/${slug}/tienda`, { waitUntil: "networkidle" });
  await expect(page.getByTestId("plan-upgrade")).toContainText("Tienda es del plan Pro");
});

test("one free trial per device, even with another account", async ({ page }) => {
  const stamp = Date.now();
  const device = { "X-NV-Device": `e2edevice${stamp}abcdef` };
  const first = await register(page, "Dispositivo Uno", `e2e_dev1_${stamp}@nv.tv`);
  const a = await page.request.post(`${API}/workspaces`, { headers: { ...first, ...device }, data: { name: `Dev uno ${stamp}` } });
  expect(a.ok()).toBeTruthy();
  const slugA = ((await a.json()) as { slug: string }).slug;
  const viewA = (await (await page.request.get(`${API}/workspaces/${slugA}/access`, { headers: first })).json()) as {
    state: string;
  };
  expect(viewA.state).toBe("trial");

  const second = await register(page, "Dispositivo Dos", `e2e_dev2_${stamp}@nv.tv`);
  const b = await page.request.post(`${API}/workspaces`, { headers: { ...second, ...device }, data: { name: `Dev dos ${stamp}` } });
  expect(b.ok()).toBeTruthy();
  const slugB = ((await b.json()) as { slug: string }).slug;
  const viewB = (await (await page.request.get(`${API}/workspaces/${slugB}/access`, { headers: second })).json()) as {
    state: string;
    trialDenied?: boolean;
  };
  expect(viewB).toMatchObject({ state: "expired", trialDenied: true });
  expect((await page.request.get(`${API}/workspaces/${slugB}/contacts`, { headers: second })).status()).toBe(402);
});
