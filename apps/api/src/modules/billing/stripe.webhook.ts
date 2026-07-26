import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Stripe webhook signature (`Stripe-Signature` header) against the raw
 * request body. Implements Stripe's scheme without the SDK:
 *   signed_payload = `${t}.${rawBody}` ; expected = HMAC-SHA256(secret) hex.
 * Pure — unit tested.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",").reduce<Record<string, string[]>>((acc, item) => {
    const [key, value] = item.split("=");
    if (key && value) (acc[key] ??= []).push(value);
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return false;

  // Reject stale timestamps to blunt replay attacks.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected);

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

/** Minimal shape of the Stripe events we act on. */
export interface StripeWebhookEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

export interface SubscriptionUpdate {
  customerId: string;
  subscriptionId: string | null;
  status: string | null;
  priceId: string | null;
}

/**
 * Extract the fields we persist from a subscription/checkout event, or null if
 * the event isn't one we handle or lacks a customer. Pure — unit tested.
 */
export function extractSubscriptionUpdate(event: StripeWebhookEvent): SubscriptionUpdate | null {
  const obj = event.data.object;
  const customerId = typeof obj.customer === "string" ? obj.customer : null;
  if (!customerId) return null;

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const items = obj.items as { data?: { price?: { id?: string } }[] } | undefined;
      return {
        customerId,
        subscriptionId: typeof obj.id === "string" ? obj.id : null,
        status:
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : typeof obj.status === "string"
              ? obj.status
              : null,
        priceId: items?.data?.[0]?.price?.id ?? null,
      };
    }
    case "checkout.session.completed": {
      return {
        customerId,
        subscriptionId: typeof obj.subscription === "string" ? obj.subscription : null,
        status: "active",
        priceId: null,
      };
    }
    default:
      return null;
  }
}
