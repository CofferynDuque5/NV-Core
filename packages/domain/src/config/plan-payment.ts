import type { PaymentMethodKind } from "../enums";

/**
 * What a customer fills in when they send a plan payment: who paid, from
 * where, when and how much, plus the receipt. The operator checks these
 * against their own account before approving.
 */

export interface PayerField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "date" | "tel";
}

const name: PayerField = {
  key: "payerName",
  label: "Nombre de quien pagó",
  required: true,
  placeholder: "Como aparece en el banco o la billetera",
};
const paidOn: PayerField = { key: "paidOn", label: "Fecha del pago", required: true, type: "date" };
const amount: PayerField = {
  key: "amountPaid",
  label: "Monto que pagaste",
  required: true,
  placeholder: "Ej.: 1.234,56 Bs o 7 USDT",
};
const bank: PayerField = {
  key: "payerBank",
  label: "Banco desde el que pagaste",
  required: true,
  placeholder: "Ej.: Banesco",
};
const phone: PayerField = {
  key: "payerPhone",
  label: "Teléfono desde el que pagaste",
  required: true,
  type: "tel",
  placeholder: "Ej.: 04141234567",
};
const doc: PayerField = {
  key: "payerDoc",
  label: "Cédula o documento del titular",
  required: true,
  placeholder: "Ej.: V-12345678",
};
const account = (label: string, required = true): PayerField => ({
  key: "payerAccount",
  label,
  required,
});

const BY_KIND: Partial<Record<PaymentMethodKind, PayerField[]>> = {
  pago_movil: [bank, phone, doc],
  banco_ve: [bank, doc, account("Últimos 4 dígitos de tu cuenta", false)],
  banco_co: [bank, doc, account("Últimos 4 dígitos de tu cuenta", false)],
  banco_pe: [bank, doc, account("Últimos 4 dígitos de tu cuenta", false)],
  nequi: [phone],
  daviplata: [phone],
  yape: [phone],
  plin: [phone],
  binance_pay: [account("Tu Binance Pay ID o usuario")],
  usdt: [account("Dirección o exchange desde el que enviaste")],
  zinli: [account("Tu correo o celular de Zinli")],
  otro: [account("Cuenta desde la que pagaste", false)],
};

/** Fields to ask for a payment made with this kind of method, in order. */
export function planPayerFields(kind: string): PayerField[] {
  return [name, ...(BY_KIND[kind as PaymentMethodKind] ?? []), paidOn, amount];
}

/** Receipts: a photo/screenshot or a PDF, up to 5 MB. */
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const RECEIPT_ACCEPT = RECEIPT_TYPES.join(",");

/** Bolívares for a USD price at a USDT rate, rounded to cents. */
export function vesAmount(usd: number, rate: number): number {
  return Math.round(usd * rate * 100) / 100;
}
