import { useParams } from "react-router-dom";

import { isBackendConfigured } from "@/lib/env";
import { useAccess } from "@/hooks/use-domain-data";
import { useAuthStore } from "@/stores/auth-store";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton } from "@/components/common/skeletons";
import { PlanCards, PlanOverview } from "@/components/access/plan-access";

/** «Mi plan»: the brand's plan, what every plan includes and how to upgrade. */
export default function PlanPage() {
  const { workspace: slug } = useParams<{ workspace: string }>();
  const memberships = useAuthStore((s) => s.memberships);
  const role = memberships.find((m) => m.workspaceSlug === slug)?.role;
  const canPay = role === "Owner" || role === "Admin";
  const access = useAccess(slug, isBackendConfigured());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sistema"
        title="Mi plan"
        description="Lo que incluye cada plan y cómo mejorar el tuyo. Pagas a nuestras cuentas y lo activamos al ver el pago."
      />
      {!isBackendConfigured() ? (
        <PlanCards
          access={{
            state: "unlimited",
            plan: { price: 19, currency: "USD", days: 30 },
            plans: [
              { id: "basico", price: 7, currency: "USD", days: 30 },
              { id: "pro", price: 19, currency: "USD", days: 30 },
            ],
            methods: [],
          }}
          canPay={false}
        />
      ) : access.isLoading || !access.data || !slug ? (
        <ListSkeleton rows={4} />
      ) : (
        <PlanOverview slug={slug} access={access.data} canPay={canPay} />
      )}
    </div>
  );
}
