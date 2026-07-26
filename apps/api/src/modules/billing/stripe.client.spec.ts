import { describe, expect, it } from "vitest";

import { toFormBody } from "./stripe.client";

describe("toFormBody", () => {
  it("encodes flat scalars", () => {
    expect(toFormBody({ mode: "subscription", customer: "cus_1" })).toBe(
      "mode=subscription&customer=cus_1",
    );
  });

  it("encodes nested arrays with bracket syntax (Stripe line_items)", () => {
    const body = toFormBody({ line_items: [{ price: "price_1", quantity: 1 }] });
    expect(body).toBe("line_items[0][price]=price_1&line_items[0][quantity]=1");
  });

  it("encodes nested objects (metadata)", () => {
    expect(toFormBody({ metadata: { workspaceSlug: "ciclo-creativo" } })).toBe(
      "metadata[workspaceSlug]=ciclo-creativo",
    );
  });

  it("skips undefined and null values", () => {
    expect(toFormBody({ a: "1", b: undefined, c: null })).toBe("a=1");
  });

  it("url-encodes special characters", () => {
    expect(toFormBody({ success_url: "https://x.io/ok?s=1" })).toBe(
      "success_url=https%3A%2F%2Fx.io%2Fok%3Fs%3D1",
    );
  });
});
