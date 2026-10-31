/**
 * The plans a customer brand pays for (manual payment through Cobros). Prices
 * are set by the operator (env) and travel with the access overview; what
 * each plan includes and its limits live here so the panel, the site and the
 * API agree.
 */

export type SalesPlanId = "basico" | "pro";

export interface SalesPlanLimits {
  /** WhatsApp numbers the brand can connect. */
  whatsappNumbers: number;
  /** Telegram accounts the brand can connect. */
  telegramAccounts: number;
  /** Brands the owner can have while this brand is on the plan (null = no limit). */
  brands: number | null;
}

export interface SalesPlan {
  id: SalesPlanId;
  name: string;
  tagline: string;
  limits: SalesPlanLimits;
  /** What it includes, in the customer's words. */
  features: string[];
}

export const SALES_PLAN_IDS: SalesPlanId[] = ["basico", "pro"];

/** Everything both plans share. */
const SHARED_FEATURES = [
  "Campañas programadas con imágenes y rotación",
  "Contactos (CRM), Inbox y etiquetas",
  "Tienda, Cobros y mensajes de cobro",
  "Automatizaciones, formularios y embudos",
  "Informe semanal y analítica",
];

export const SALES_PLANS: Record<SalesPlanId, SalesPlan> = {
  basico: {
    id: "basico",
    name: "Básico",
    tagline: "Para empezar con un solo número",
    limits: { whatsappNumbers: 1, telegramAccounts: 1, brands: 1 },
    features: ["1 número de WhatsApp", "1 cuenta de Telegram", "1 marca", ...SHARED_FEATURES],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Para vender con varios números y marcas",
    limits: { whatsappNumbers: 5, telegramAccounts: 1, brands: null },
    features: [
      "Hasta 5 números de WhatsApp",
      "1 cuenta de Telegram",
      "Varias marcas (cada una con su plan)",
      ...SHARED_FEATURES,
    ],
  },
};

/** A plan id from untrusted input, or undefined. */
export function salesPlanId(value: unknown): SalesPlanId | undefined {
  return SALES_PLAN_IDS.includes(value as SalesPlanId) ? (value as SalesPlanId) : undefined;
}

/** Said wherever the customer pays: payments are final. */
export const NO_REFUNDS_NOTICE =
  "Los pagos no son reembolsables: revisa el plan antes de pagar. Puedes mejorar de plan cuando quieras.";
