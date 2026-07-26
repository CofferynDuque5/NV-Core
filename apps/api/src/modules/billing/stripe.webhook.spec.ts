import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { extractSubscriptionUpdate, verifyStripeSignature } from "./stripe.webhook";

const SECRET = "whsec_test";

function sign(body: string, ts: number, secret = SECRET): string {
  const v1 = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

describe("verifyStripeSignature", () => {
  const body = '{"id":"evt_1"}';
  const now = 1_700_000_000;

  it("accepts a valid, fresh signature", () => {
    expect(verifyStripeSignature(body, sign(body, now), SECRET, 300, now)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(verifyStripeSignature(body, sign(body, now, "nope"), SECRET, 300, now)).toBe(false);
  });

  it("rejects a tampered body", () => {
    expect(verifyStripeSignature('{"id":"evt_2"}', sign(body, now), SECRET, 300, now)).toBe(false);
  });

  it("rejects a stale timestamp (replay)", () => {
    expect(verifyStripeSignature(body, sign(body, now - 10_000), SECRET, 300, now)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyStripeSignature(body, undefined, SECRET, 300, now)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", SECRET, 300, now)).toBe(false);
  });
});

describe("extractSubscriptionUpdate", () => {
  it("maps subscription.updated with price + status", () => {
    const update = extractSubscriptionUpdate({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          items: { data: [{ price: { id: "price_9" } }] },
        },
      },
    });
    expect(update).toEqual({
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      priceId: "price_9",
    });
  });

  it("forces canceled status on subscription.deleted", () => {
    const update = extractSubscriptionUpdate({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", customer: "cus_1", status: "active", items: { data: [] } } },
    });
    expect(update?.status).toBe("canceled");
  });

  it("maps checkout.session.completed to active with the subscription id", () => {
    const update = extractSubscriptionUpdate({
      type: "checkout.session.completed",
      data: { object: { customer: "cus_1", subscription: "sub_7" } },
    });
    expect(update).toEqual({
      customerId: "cus_1",
      subscriptionId: "sub_7",
      status: "active",
      priceId: null,
    });
  });

  it("ignores unrelated events and events without a customer", () => {
    expect(
      extractSubscriptionUpdate({ type: "invoice.created", data: { object: { customer: "cus_1" } } }),
    ).toBeNull();
    expect(
      extractSubscriptionUpdate({
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", items: { data: [] } } },
      }),
    ).toBeNull();
  });
});
