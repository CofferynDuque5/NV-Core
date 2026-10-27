import { expect, type Page } from "@playwright/test";

export const API = process.env.NV_API_URL ?? "http://localhost:4000/api";
export const PASSWORD = "password123";

/**
 * Sign a fresh user into a built-in workspace. The register form no longer
 * picks a workspace (new accounts go to /onboarding), so the account + the
 * one-time workspace claim go through the API (ALLOW_OPEN_WORKSPACE_CLAIM in
 * CI) and the session is then opened through the real login form.
 */
export async function registerInto(
  page: Page,
  opts: { name: string; email: string; workspace: string },
): Promise<void> {
  const res = await page.request.post(`${API}/auth/register`, {
    data: { name: opts.name, email: opts.email, password: PASSWORD, workspaceSlug: opts.workspace, acceptTerms: true },
  });
  expect(res.ok(), `register ${opts.email} → ${res.status()}`).toBeTruthy();
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", opts.email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/w/${opts.workspace}/**`, { timeout: 20000 });
}
