"use client";

import { Plus, Workflow } from "lucide-react";

import { useAutomations } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { ListSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";

export default function AutomatizacionesPage() {
  const automations = useAutomations();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sin código"
        title="Automatizaciones"
        description="Crea flujos que trabajan por ti: triggers, acciones, esperas y condiciones."
        actions={
          <Button size="sm">
            <Plus className="size-4" /> Nuevo flujo
          </Button>
        }
      />

      <QueryBoundary
        query={automations}
        skeleton={<ListSkeleton rows={4} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Workflow,
          title: "Sin automatizaciones",
          description:
            "Diseña tu primer flujo (ej. compra → onboarding, renovación → recordatorio). Se ejecutará con n8n cuando conectes el backend.",
          action: (
            <Button size="sm">
              <Plus className="size-4" /> Nuevo flujo
            </Button>
          ),
        }}
      >
        {() => null}
      </QueryBoundary>
    </div>
  );
}
