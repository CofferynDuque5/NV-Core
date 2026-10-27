import { expect, test } from "@playwright/test";

import { API, PASSWORD } from "./helpers";

const WS = "pulso-naturaleza";

// A real 1×1 PNG and a minimal PDF: the server checks the content, not just the name.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

test("files are saved on our own server and served from a public link", async ({ page }) => {
  const email = `e2e_files_${Date.now()}@nv.tv`;
  const reg = await page.request.post(`${API}/auth/register`, {
    data: { name: "E2E Archivos", email, password: PASSWORD, workspaceSlug: WS, acceptTerms: true },
  });
  expect(reg.ok()).toBeTruthy();
  const { accessToken } = (await reg.json()) as { accessToken: string };
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/w/${WS}/**`, { timeout: 20000 });

  await page.goto(`/w/${WS}/biblioteca`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Biblioteca", exact: true })).toBeVisible();

  // 1. An image: lands in the grid, served by our API.
  await page.locator('input[type="file"]').setInputFiles({ name: "promo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Archivo subido").first()).toBeVisible();
  const img = page.getByRole("img", { name: "promo.png" });
  await expect(img).toBeVisible();
  const src = (await img.getAttribute("src"))!;
  expect(src).toMatch(new RegExp(`/api/files/${WS}/[a-f0-9]{32}\\.png$`));
  // It really loaded in the browser (another origin in dev).
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);

  // Public link: no login needed, safe headers.
  const res = await page.request.get(src, { headers: { Authorization: "" } });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["cross-origin-resource-policy"]).toBe("cross-origin");
  expect(Buffer.from(await res.body())).toEqual(PNG);

  // 2. A document: shown as a file tile that opens the PDF.
  await page.locator('input[type="file"]').setInputFiles({ name: "catalogo.pdf", mimeType: "application/pdf", buffer: PDF });
  const doc = page.getByTitle("Abrir documento");
  await expect(doc).toBeVisible();
  await expect(doc).toHaveAttribute("href", new RegExp(`/api/files/${WS}/[a-f0-9]{32}\\.pdf$`));
  await expect(page.getByText("catalogo.pdf")).toBeVisible();

  // 3. Disguised content and guessed paths are refused.
  const fake = await page.request.post(`${API}/workspaces/${WS}/media/upload`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    multipart: { file: { name: "foto.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") } },
  });
  expect(fake.status()).toBe(400);
  expect((await page.request.get(`${API}/files/${WS}/..%2F..%2Fpackage.json`)).status()).toBe(404);
  expect((await page.request.get(`${API}/files/otra-marca/${src.split("/").pop()}`)).status()).toBe(404);
});
