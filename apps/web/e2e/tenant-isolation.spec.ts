import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Multi-tenant isolation — the most important trust property of the platform.
 * Two owners of two different workspaces must never see or touch each other's
 * data, and unauthenticated callers must be rejected. Runs against the live API
 * (no browser), so it exercises the real WorkspaceGuard + JWT guard wiring.
 */

const API = process.env.NV_API_URL ?? "http://localhost:4000/api";
const stamp = Date.now();
// Distinct built-in workspaces, each unused by any other spec so the one-time
// "first member claims the workspace" bootstrap always succeeds on a clean DB.
const WS_A = "perla-tour";
const WS_B = "varouduva-store";

async function register(
  request: APIRequestContext,
  email: string,
  workspaceSlug: string,
): Promise<string> {
  const res = await request.post(`${API}/auth/register`, {
    data: { email, password: "password123", name: "Iso Test", workspaceSlug },
  });
  expect(res.ok(), `register ${email} → ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as {
    accessToken: string;
    memberships: { workspaceSlug: string; role: string }[];
  };
  // Confirm the user actually claimed the workspace it asked for.
  expect(body.memberships.some((m) => m.workspaceSlug === workspaceSlug)).toBeTruthy();
  return body.accessToken;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe.serial("multi-tenant isolation", () => {
  let tokenA = "";
  let tokenB = "";
  let contactAId = "";

  test("two owners each claim their own workspace", async ({ request }) => {
    tokenA = await register(request, `iso_a_${stamp}@nv.tv`, WS_A);
    tokenB = await register(request, `iso_b_${stamp}@nv.tv`, WS_B);
  });

  test("owner A creates a contact in workspace A", async ({ request }) => {
    const res = await request.post(`${API}/workspaces/${WS_A}/contacts`, {
      headers: auth(tokenA),
      data: { name: `Secreto A ${stamp}`, stage: "Lead" },
    });
    expect(res.ok(), `create → ${res.status()}`).toBeTruthy();
    const contact = (await res.json()) as { id: string; name: string };
    contactAId = contact.id;
    expect(contact.name).toContain("Secreto A");
  });

  test("owner A can read its own contact list", async ({ request }) => {
    const res = await request.get(`${API}/workspaces/${WS_A}/contacts`, { headers: auth(tokenA) });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.some((c) => c.id === contactAId)).toBeTruthy();
  });

  test("owner B cannot LIST workspace A's contacts (403)", async ({ request }) => {
    const res = await request.get(`${API}/workspaces/${WS_A}/contacts`, { headers: auth(tokenB) });
    expect(res.status()).toBe(403);
  });

  test("owner B cannot CREATE in workspace A (403)", async ({ request }) => {
    const res = await request.post(`${API}/workspaces/${WS_A}/contacts`, {
      headers: auth(tokenB),
      data: { name: "Intruso", stage: "Lead" },
    });
    expect(res.status()).toBe(403);
  });

  test("owner B's own workspace never contains A's data", async ({ request }) => {
    const res = await request.get(`${API}/workspaces/${WS_B}/contacts`, { headers: auth(tokenB) });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { items: { id: string; name: string }[] };
    expect(body.items.some((c) => c.id === contactAId)).toBeFalsy();
    expect(body.items.some((c) => c.name.includes("Secreto A"))).toBeFalsy();
  });

  test("unauthenticated access is rejected (401)", async ({ request }) => {
    const res = await request.get(`${API}/workspaces/${WS_A}/contacts`);
    expect(res.status()).toBe(401);
  });
});
