import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const stamp = Date.now();
const email = `e2e_contactos_${stamp}@nv.tv`;

test("importar una hoja con vista previa y fusionar contactos repetidos", async ({ page }) => {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Contactos", email, password: PASSWORD, acceptTerms: true },
  });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const created = await page.request.post(`${API}/workspaces`, {
    headers: auth,
    data: { name: `Contactos ${stamp}`, kind: "creative", accent: "#5F86F2" },
  });
  const { slug: WS } = (await created.json()) as { slug: string };

  // One contact already in the list, so the import must skip it.
  await page.request.post(`${API}/workspaces/${WS}/contacts`, {
    headers: auth,
    data: { name: "Ana Pérez", phone: "+58 412 000 1111" },
  });

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(w|onboarding)\//, { timeout: 20000 }).catch(() => undefined);
  await page.goto(`/w/${WS}/contactos`, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Importar" }).first().click();
  const sheet = [
    "Cliente;Celular;Correo",
    "Ana Pérez;04120001111;",
    "Luis Gómez;+58 414 222 3333;luis@ejemplo.com",
    "María Ruiz;+57 300 444 5555;",
  ].join("\n");
  await page.getByLabel("Archivo de contactos").setInputFiles({
    name: "clientes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheet, "utf8"),
  });
  await expect(page.getByTestId("import-preview")).toContainText("Luis Gómez");
  await expect(page.getByLabel("Qué es la columna Celular")).toHaveValue("phone");
  await expect(page.getByLabel("Qué es la columna Cliente")).toHaveValue("name");
  await expect(page.getByTestId("import-summary")).toContainText("2 nuevos");
  await expect(page.getByTestId("import-summary")).toContainText("1 ya");
  if (process.env.E2E_SHOTS) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda5-importar.png` });
  }
  await page.getByTestId("import-confirm").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const list = await page.request.get(`${API}/workspaces/${WS}/contacts`, { headers: auth });
  const contacts = ((await list.json()) as { items: Array<{ name: string }> }).items;
  expect(contacts.map((c) => c.name).sort()).toEqual(["Ana Pérez", "Luis Gómez", "María Ruiz"]);

  // Two cards for the same person (same phone written differently).
  await page.request.post(`${API}/workspaces/${WS}/contacts`, {
    headers: auth,
    data: { name: "Luis G.", phone: "584142223333" },
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("contacts-duplicates").click();
  const group = page.getByTestId("duplicate-group");
  await expect(group).toHaveCount(1);
  await expect(group).toContainText("Luis Gómez");
  await expect(group).toContainText("Luis G.");
  if (process.env.E2E_SHOTS) {
    await page.screenshot({ path: `${process.env.E2E_SHOTS}/tanda5-duplicados.png` });
  }
  await group.getByTestId("duplicate-merge").click();
  await expect(page.getByText("contactos fusionados en uno")).toBeVisible();

  const after = (
    (await (await page.request.get(`${API}/workspaces/${WS}/contacts`, { headers: auth })).json()) as {
      items: Array<{ name: string; email?: string | null }>;
    }
  ).items;
  expect(after).toHaveLength(3);
  expect(after.find((c) => c.name.startsWith("Luis"))?.email).toBe("luis@ejemplo.com");
});
