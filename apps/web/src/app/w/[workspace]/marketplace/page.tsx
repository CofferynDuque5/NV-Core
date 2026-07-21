"use client";

import { Store } from "lucide-react";

import { useIntegrations } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Input } from "@/components/ui/input";

export default function MarketplacePage() {
  const integrations = useIntegrations();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integraciones"
        title="Marketplace"
        description="Conecta NV Core con tus herramientas favoritas."
      />

      <Input placeholder="Buscar integraciones…" className="max-w-xs" />

      {integrations.isLoading ? (
        <CardGridSkeleton count={9} />
      ) : (
        <EmptyState
          icon={Store}
          title="Catálogo en preparación"
          description="El catálogo de integraciones (Google, Stripe, Slack, Notion, Zapier y más) estará disponible al conectar el backend."
        />
      )}
    </div>
  );
}
