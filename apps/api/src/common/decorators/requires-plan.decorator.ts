import { SetMetadata } from "@nestjs/common";

export const REQUIRES_PLAN = "requires_active_plan";

/**
 * Marks a route as premium: it requires an active subscription for the workspace
 * — but only when billing is actually configured (STRIPE_SECRET_KEY set).
 */
export const RequiresActivePlan = () => SetMetadata(REQUIRES_PLAN, true);
