import type { PaymentCurrency, PaymentMethodKind, PaymentStatus } from "../enums";
import type { PaymentMethod } from "../entities";

/**
 * Catalog of manual payment methods (Colombia, Venezuela, Peru, Binance,
 * Zinli). Each lists the details a customer needs to pay; the brand fills
 * them in. Nothing here talks to a bank or wallet: payments are confirmed by
 * the team checking its own account.
 */

export interface PaymentMethodField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

export interface PaymentMethodKindDef {
  kind: PaymentMethodKind;
  label: string;
  /** ISO country, or "global" for crypto / international wallets. */
  country: "CO" | "VE" | "PE" | "global";
  currency: PaymentCurrency;
  fields: PaymentMethodField[];
}

const holder: PaymentMethodField = { key: "holder", label: "Titular", required: true };
const phone: PaymentMethodField = { key: "phone", label: "Número de celular", required: true };
const docId: PaymentMethodField = { key: "docId", label: "Documento (CC, CI, RIF, DNI…)" };
const account: PaymentMethodField = { key: "account", label: "Número de cuenta", required: true };
const bank: PaymentMethodField = { key: "bank", label: "Banco", required: true };

export const PAYMENT_METHOD_CATALOG: PaymentMethodKindDef[] = [
  { kind: "nequi", label: "Nequi", country: "CO", currency: "COP", fields: [phone, holder] },
  { kind: "daviplata", label: "Daviplata", country: "CO", currency: "COP", fields: [phone, holder] },
  {
    kind: "banco_co",
    label: "Transferencia bancaria (Colombia)",
    country: "CO",
    currency: "COP",
    fields: [
      { ...bank, placeholder: "Bancolombia" },
      { key: "accountType", label: "Tipo de cuenta", options: ["Ahorros", "Corriente"] },
      account,
      holder,
      docId,
    ],
  },
  {
    kind: "pago_movil",
    label: "Pago Móvil",
    country: "VE",
    currency: "VES",
    fields: [{ ...bank, placeholder: "Banesco (0134)" }, phone, { ...docId, required: true }, holder],
  },
  {
    kind: "banco_ve",
    label: "Transferencia bancaria (Venezuela)",
    country: "VE",
    currency: "VES",
    fields: [bank, account, holder, { ...docId, required: true }],
  },
  { kind: "yape", label: "Yape", country: "PE", currency: "PEN", fields: [phone, holder] },
  { kind: "plin", label: "Plin", country: "PE", currency: "PEN", fields: [phone, holder] },
  {
    kind: "banco_pe",
    label: "Transferencia bancaria (Perú)",
    country: "PE",
    currency: "PEN",
    fields: [{ ...bank, placeholder: "BCP" }, account, { key: "cci", label: "CCI" }, holder],
  },
  {
    kind: "binance_pay",
    label: "Binance Pay",
    country: "global",
    currency: "USDT",
    fields: [{ key: "payId", label: "Binance Pay ID", required: true }, { key: "holder", label: "Usuario" }],
  },
  {
    kind: "usdt",
    label: "USDT (billetera)",
    country: "global",
    currency: "USDT",
    fields: [
      { key: "network", label: "Red", required: true, options: ["TRC20 (Tron)", "BEP20 (BNB Smart Chain)", "ERC20 (Ethereum)", "Polygon", "Solana"] },
      { key: "address", label: "Dirección", required: true },
    ],
  },
  {
    kind: "zinli",
    label: "Zinli",
    country: "global",
    currency: "USD",
    fields: [{ key: "email", label: "Correo o celular de Zinli", required: true }, holder],
  },
  { kind: "otro", label: "Otro método", country: "global", currency: "USD", fields: [] },
];

export function paymentMethodDef(kind: string): PaymentMethodKindDef {
  return PAYMENT_METHOD_CATALOG.find((d) => d.kind === kind) ?? PAYMENT_METHOD_CATALOG[PAYMENT_METHOD_CATALOG.length - 1]!;
}

export const PAYMENT_COUNTRY_LABEL: Record<PaymentMethodKindDef["country"], string> = {
  CO: "Colombia",
  VE: "Venezuela",
  PE: "Perú",
  global: "Internacional",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pendiente: "Pendiente",
  por_verificar: "Por verificar",
  pagado: "Pagado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

/** Which status changes a person may make by hand. */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pendiente: ["por_verificar", "pagado", "cancelado"],
  por_verificar: ["pagado", "rechazado", "pendiente"],
  rechazado: ["por_verificar", "pendiente", "cancelado"],
  // Undo a mistaken confirmation; it stays in the audit log.
  pagado: ["por_verificar"],
  cancelado: ["pendiente"],
};

/** Decimals shown per currency (COP/VES amounts rarely carry cents). */
export const PAYMENT_CURRENCY_DECIMALS: Record<PaymentCurrency, number> = {
  COP: 0,
  VES: 2,
  PEN: 2,
  USD: 2,
  USDT: 2,
};

/** "$ 150.000 COP", "S/ 49,90", "25,00 USDT". */
export function formatPaymentAmount(amount: number, currency: PaymentCurrency): string {
  const decimals = PAYMENT_CURRENCY_DECIMALS[currency];
  const n = new Intl.NumberFormat("es-CO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount);
  switch (currency) {
    case "COP":
      return `$ ${n} COP`;
    case "VES":
      return `Bs. ${n}`;
    case "PEN":
      return `S/ ${n}`;
    case "USD":
      return `US$ ${n}`;
    default:
      return `${n} USDT`;
  }
}

/** "Nequi: 300 123 4567 · Titular: Ana Ruiz" — a method's details on one line. */
export function paymentMethodLine(method: Pick<PaymentMethod, "kind" | "label" | "details" | "instructions">): string {
  const def = paymentMethodDef(method.kind);
  const parts = def.fields
    .map((f) => [f.label, (method.details[f.key] ?? "").trim()] as const)
    .filter(([, v]) => v)
    .map(([label, v]) => `${label}: ${v}`);
  const extra = method.instructions?.trim();
  return [`${method.label || def.label}`, ...parts, ...(extra ? [extra] : [])].join(" · ");
}

/**
 * Message the team sends the customer (copy/paste or through the Inbox): the
 * amount, the methods to pay with, and how to report the payment. Drafted
 * text only — it is never sent automatically.
 */
export function paymentInstructions(input: {
  contactName?: string;
  concept: string;
  amount: number;
  currency: PaymentCurrency;
  methods: Pick<PaymentMethod, "kind" | "label" | "details" | "instructions">[];
}): string {
  const hello = input.contactName?.trim() ? `Hola ${input.contactName.trim()}` : "Hola";
  const lines = [
    `${hello}, para pagar «${input.concept.trim()}» el valor es ${formatPaymentAmount(input.amount, input.currency)}.`,
    "",
    input.methods.length === 1 ? "Puedes pagar por:" : "Puedes pagar por cualquiera de estos medios:",
    ...input.methods.map((m) => `• ${paymentMethodLine(m)}`),
    "",
    "Cuando pagues, envíanos por este chat la captura del comprobante y el número de referencia. Te confirmamos apenas lo verifiquemos.",
  ];
  return lines.join("\n");
}
