import { SALES_PLANS, type PlanFeature } from "@nv/domain";

import { useAccess } from "@/hooks/use-domain-data";
import { isBackendConfigured } from "@/lib/env";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Modules the brand's paid plan does not open (Básico: Tienda, Cobros,
 * Automatizaciones, Formularios, Embudos). The trial is Pro, an expired brand
 * is locked whole elsewhere, and the platform admin sees everything. The API
 * enforces the same rule (402 «plan_upgrade»); this only shapes the panel.
 */
export function usePlanLocks(slug: string | undefined): PlanFeature[] {
  const superAdmin = useAuthStore((s) => s.superAdmin);
  const authed = useAuthStore((s) => s.status === "authenticated");
  const access = useAccess(slug, isBackendConfigured() && authed);
  const data = access.data;
  if (superAdmin || !data || data.state !== "active") return [];
  return SALES_PLANS[data.planId ?? "pro"].lockedModules;
}
