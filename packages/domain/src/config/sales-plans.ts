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
  /** What it does NOT include, in the customer's words. */
  excluded: string[];
  /** Panel modules (sidebar ids) this plan does not open. */
  lockedModules: PlanFeature[];
}

/** Paid extras: the panel module id of each. */
export type PlanFeature = "tienda" | "cobros" | "automatizaciones" | "formularios" | "embudos";

/**
 * API section (`/workspaces/:ws/<section>`) behind each extra. The guard
 * answers 402 «plan_upgrade» on them for a plan that does not include it.
 */
export const PLAN_FEATURE_SECTIONS: Record<PlanFeature, string[]> = {
  tienda: ["products"],
  cobros: ["payments"],
  automatizaciones: ["automations"],
  formularios: ["forms"],
  embudos: ["funnels"],
};

export const PLAN_FEATURE_LABEL: Record<PlanFeature, string> = {
  tienda: "Tienda",
  cobros: "Cobros",
  automatizaciones: "Automatizaciones",
  formularios: "Formularios",
  embudos: "Embudos",
};

/** The extra behind an API section, if the section is one. */
export function planFeatureOfSection(section: string): PlanFeature | undefined {
  for (const [feature, sections] of Object.entries(PLAN_FEATURE_SECTIONS)) {
    if (sections.includes(section)) return feature as PlanFeature;
  }
  return undefined;
}

/** True when the plan opens that module (Pro opens all). */
export function planIncludes(planId: SalesPlanId, feature: PlanFeature): boolean {
  return !SALES_PLANS[planId].lockedModules.includes(feature);
}

/** Campaign sends the free trial allows before it closes. */
export const TRIAL_CAMPAIGN_SENDS = 1;

export const SALES_PLAN_IDS: SalesPlanId[] = ["basico", "pro"];

/** Everything both plans share. */
const SHARED_FEATURES = [
  "Campañas programadas con imágenes y rotación",
  "Contactos (CRM), Inbox y etiquetas",
  "Informe semanal y analítica",
];

/** Only in Pro. */
const PRO_EXTRAS = ["Tienda, Cobros y mensajes de cobro", "Automatizaciones, formularios y embudos"];

export const SALES_PLANS: Record<SalesPlanId, SalesPlan> = {
  basico: {
    id: "basico",
    name: "Básico",
    tagline: "Para empezar con un solo número",
    limits: { whatsappNumbers: 1, telegramAccounts: 1, brands: 1 },
    features: ["1 número de WhatsApp", "1 cuenta de Telegram", "1 marca", ...SHARED_FEATURES],
    excluded: PRO_EXTRAS,
    lockedModules: ["tienda", "cobros", "automatizaciones", "formularios", "embudos"],
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
      ...PRO_EXTRAS,
    ],
    excluded: [],
    lockedModules: [],
  },
};

/** A plan id from untrusted input, or undefined. */
export function salesPlanId(value: unknown): SalesPlanId | undefined {
  return SALES_PLAN_IDS.includes(value as SalesPlanId) ? (value as SalesPlanId) : undefined;
}

/** Said wherever the customer pays: payments are final. */
export const NO_REFUNDS_NOTICE =
  "Los pagos no son reembolsables: revisa el plan antes de pagar. Puedes mejorar de plan cuando quieras.";
