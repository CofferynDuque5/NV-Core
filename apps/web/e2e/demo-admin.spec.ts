import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

// Platform admin (NV_SUPER_ADMINS in CI).
const ADMIN = process.env.E2E_SUPER_ADMIN ?? "e2e_superadmin@nv.tv";

test("«Ver demo» opens the read-only example brand without an account", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByTestId("demo-button").click();
  await page.waitForURL("**/w/nv-demo/**", { timeout: 20000 });
  await expect(page.getByTestId("demo-banner")).toBeVisible();

  // The demo account can look, never change anything.
  const res = await page.request.post(`${API}/auth/demo`);
  expect(res.ok()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const contacts = await page.request.get(`${API}/workspaces/nv-demo/contacts`, { headers });
  expect(contacts.ok()).toBeTruthy();
  const write = await page.request.post(`${API}/workspaces`, { headers, data: { name: "Intento demo" } });
  expect(write.status()).toBe(403);
});

test("the platform admin sees who signs in, uses the panel, from which device, and the demo", async ({ page }) => {
  const stamp = Date.now();
  const someone = `e2e_visita_${stamp}@nv.tv`;
  for (const [name, email] of [["Visita Prueba", someone], ["Admin Plataforma", ADMIN]] as const) {
    const res = await page.request.post(`${API}/auth/register`, {
      data: { name, email, password: PASSWORD, acceptTerms: true },
    });
    // The admin may already exist when the spec is re-run on the same database.
    expect(res.ok() || res.status() === 409, `register ${email} → ${res.status()}`).toBeTruthy();
  }

  // Someone uses the panel from a phone: a wrong password first, then campaigns and inbox.
  const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
  const wrong = await page.request.post(`${API}/auth/login`, {
    headers: { "User-Agent": PHONE },
    data: { email: someone, password: "no-es-la-clave" },
  });
  expect(wrong.status()).toBe(401);
  const login = await page.request.post(`${API}/auth/login`, {
    headers: { "User-Agent": PHONE },
    data: { email: someone, password: PASSWORD },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const sid = `e2e${stamp}`;
  for (const path of ["/w/mi-marca/campanas", "/w/mi-marca/inbox", "/w/mi-marca/campanas"]) {
    const ping = await page.request.post(`${API}/activity/ping`, {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": PHONE },
      data: { sessionId: sid, path },
    });
    expect(ping.status()).toBe(204);
  }
  // A demo visitor from a computer (the demo may report it is there, nothing else).
  const demo = (await (await page.request.post(`${API}/auth/demo`)).json()) as { accessToken: string };
  const demoPing = await page.request.post(`${API}/activity/ping`, {
    headers: { Authorization: `Bearer ${demo.accessToken}` },
    data: { sessionId: `demo${stamp}`, path: "/w/nv-demo/grupos" },
  });
  expect(demoPing.status()).toBe(204);
  // Only the platform admin reads the activity.
  const forbidden = await page.request.get(`${API}/admin/activity?days=7`, { headers: { Authorization: `Bearer ${accessToken}` } });
  expect(forbidden.status()).toBe(403);

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", ADMIN);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });

  await page.goto("/admin", { waitUntil: "networkidle" });
  if (process.env.E2E_SHOTS) await page.setViewportSize({ width: 1400, height: 1000 });
  const section = page.getByTestId("admin-logins");
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading", { name: "Usuarios y actividad" })).toBeVisible();

  // Live now: the phone visit, where it is right now.
  const liveRow = section.getByTestId("admin-visit").filter({ hasText: someone });
  await expect(liveRow).toContainText("Safari · iPhone/iPad");
  await expect(liveRow).toContainText("Ahora en Campañas");
  await expect(liveRow).toContainText("Inbox");
  if (process.env.E2E_SHOTS) {
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: `${process.env.E2E_SHOTS}/actividad-vivo.png` });
  }

  // Users: time in the panel and devices; opening the row lists their visits.
  await section.getByRole("tab", { name: "Usuarios" }).click();
  const userRow = section.getByTestId("admin-login-user").filter({ hasText: someone });
  await expect(userRow).toContainText("Safari · iPhone/iPad");
  await expect(userRow).toContainText("3 páginas");
  await userRow.getByRole("button").click();
  await expect(section.getByTestId("admin-visit").first()).toBeVisible();
  if (process.env.E2E_SHOTS) await section.screenshot({ path: `${process.env.E2E_SHOTS}/actividad-usuarios.png` });

  // The demo: each visit is a different person.
  await section.getByRole("tab", { name: /Demo/ }).click();
  await expect(section.getByTestId("admin-visit").filter({ hasText: "Grupos" }).first()).toBeVisible();
  if (process.env.E2E_SHOTS) await section.screenshot({ path: `${process.env.E2E_SHOTS}/actividad-demo.png` });

  await section.getByRole("tab", { name: "Equipos y secciones" }).click();
  await expect(section.getByText("Secciones más usadas")).toBeVisible();
  await expect(section.getByText("Móvil")).toBeVisible();
  if (process.env.E2E_SHOTS) await section.screenshot({ path: `${process.env.E2E_SHOTS}/actividad-equipos.png` });

  // Sign-ins, with the wrong password in red.
  await section.getByRole("tab", { name: "Inicios de sesión" }).click();
  await expect(section.getByTestId("admin-login-event").filter({ hasText: someone }).filter({ hasText: "Contraseña incorrecta" })).toBeVisible();
  if (process.env.E2E_SHOTS) await section.screenshot({ path: `${process.env.E2E_SHOTS}/actividad-accesos.png` });
});
