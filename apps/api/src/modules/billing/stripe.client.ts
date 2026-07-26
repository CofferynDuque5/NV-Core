/**
 * Minimal Stripe REST client over `fetch` (no SDK dependency).
 * Stripe expects `application/x-www-form-urlencoded` with bracket-nested keys.
 */

type FormValue = string | number | boolean | undefined | null;
export interface FormObject {
  [key: string]: FormValue | FormObject | Array<FormValue | FormObject>;
}

/**
 * Flatten a nested object into Stripe's bracketed form syntax (pure — testable).
 * Structural brackets stay literal; key segments and values are URL-encoded.
 */
export function toFormBody(obj: FormObject, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const scoped = prefix ? `${prefix}[${encodeURIComponent(key)}]` : encodeURIComponent(key);
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        const scopedItem = `${scoped}[${i}]`;
        if (typeof item === "object" && item !== null) {
          parts.push(toFormBody(item as FormObject, scopedItem));
        } else if (item !== undefined && item !== null) {
          parts.push(`${scopedItem}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === "object") {
      parts.push(toFormBody(value as FormObject, scoped));
    } else {
      parts.push(`${scoped}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

export class StripeClient {
  constructor(private readonly secretKey: string) {}

  private async request<T>(path: string, body: FormObject): Promise<T> {
    const res = await fetch(`https://api.stripe.com${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: toFormBody(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = (data.error as { message?: string })?.message ?? `Stripe ${res.status}`;
      throw new Error(message);
    }
    return data as T;
  }

  createCustomer(input: { name?: string; metadata?: Record<string, string> }): Promise<{ id: string }> {
    return this.request("/v1/customers", { name: input.name, metadata: input.metadata });
  }

  createCheckoutSession(input: {
    customer: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string }> {
    return this.request("/v1/checkout/sessions", {
      mode: "subscription",
      customer: input.customer,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: [{ price: input.priceId, quantity: 1 }],
    });
  }

  createPortalSession(input: { customer: string; returnUrl: string }): Promise<{ url: string }> {
    return this.request("/v1/billing_portal/sessions", {
      customer: input.customer,
      return_url: input.returnUrl,
    });
  }
}
