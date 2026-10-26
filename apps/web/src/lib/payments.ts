import {
  PAYMENT_COUNTRY_LABEL,
  PAYMENT_STATUSES,
  paymentMethodDef,
  type PaymentCurrency,
  type PaymentMethod,
  type PaymentMethodKindDef,
  type PaymentRequest,
  type PaymentStatus,
} from "@nv/domain";

/**
 * Cobros page logic, kept pure for unit tests: grouping, matching methods to a
 * request, counters and what was collected this month.
 */

export const STATUS_BADGE: Record<PaymentStatus, "default" | "success" | "warning" | "danger" | "neutral"> = {
  pendiente: "neutral",
  por_verificar: "warning",
  pagado: "success",
  rechazado: "danger",
  cancelado: "neutral",
};

/** Methods grouped by country, in catalog order (Colombia, Venezuela, Perú, Internacional). */
export function methodsByCountry(methods: PaymentMethod[]): { country: string; label: string; methods: PaymentMethod[] }[] {
  const order: PaymentMethodKindDef["country"][] = ["CO", "VE", "PE", "global"];
  return order
    .map((country) => ({
      country,
      label: PAYMENT_COUNTRY_LABEL[country],
      methods: methods.filter((m) => paymentMethodDef(m.kind).country === country),
    }))
    .filter((g) => g.methods.length > 0);
}

/** Active methods that take the request's currency (what to offer the customer). */
export function methodsFor(methods: PaymentMethod[], currency: PaymentCurrency): PaymentMethod[] {
  return methods.filter((m) => m.active && m.currency === currency);
}

export function statusCounts(payments: PaymentRequest[]): Record<PaymentStatus, number> {
  const out = Object.fromEntries(PAYMENT_STATUSES.map((s) => [s, 0])) as Record<PaymentStatus, number>;
  for (const p of payments) out[p.status]++;
  return out;
}

/** Sum of payments confirmed in the calendar month of `now`, per currency (never mixed). */
export function collectedThisMonth(payments: PaymentRequest[], now = new Date()): { currency: PaymentCurrency; amount: number }[] {
  const totals = new Map<PaymentCurrency, number>();
  for (const p of payments) {
    if (p.status !== "pagado" || !p.paidAt) continue;
    const d = new Date(p.paidAt);
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
    totals.set(p.currency, Math.round(((totals.get(p.currency) ?? 0) + p.amount) * 100) / 100);
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

/** Pending requests whose due date has passed. */
export function isOverdue(p: PaymentRequest, now = new Date()): boolean {
  return (p.status === "pendiente" || p.status === "rechazado") && !!p.dueAt && new Date(p.dueAt) < now;
}
