import { salesPlanId, type SalesPlanId } from "@nv/domain";

/**
 * The plan someone picked on the sales site («Elegir Básico» / «Elegir Pro»
 * → /register?plan=…). Everyone starts with the free trial, so the choice is
 * only remembered in this browser and offered first when it is time to pay.
 */
const KEY = "nv-plan-elegido";

/** The plan in a `?plan=` query string («free» and unknown values → undefined). */
export function planFromSearch(search: string | URLSearchParams): SalesPlanId | undefined {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return salesPlanId(params.get("plan")?.trim().toLowerCase());
}

export function rememberChosenPlan(plan: SalesPlanId | undefined): void {
  try {
    if (plan) localStorage.setItem(KEY, plan);
  } catch {
    /* storage blocked: the choice simply isn't remembered */
  }
}

export function chosenPlan(): SalesPlanId | undefined {
  try {
    return salesPlanId(localStorage.getItem(KEY));
  } catch {
    return undefined;
  }
}

export function forgetChosenPlan(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
