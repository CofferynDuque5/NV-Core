"use client";

import { Megaphone, Plus } from "lucide-react";

import { useCampaigns } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";

export default function CampanasPage() {
  const campaigns = useCampaigns();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Campañas"
        description="Planifica, lanza y monitorea tus campañas omnicanal."
        actions={
          <Button size="sm">
            <Plus className="size-4" /> Nueva campaña
          </Button>
        }
      />

      <QueryBoundary
        query={campaigns}
        skeleton={<CardGridSkeleton count={6} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Megaphone,
          title: "Aún no hay campañas",
          description:
            "Crea tu primera campaña para empezar a publicar en WhatsApp, Instagram, Facebook, TikTok y más desde un solo lugar.",
          action: (
            <Button size="sm">
              <Plus className="size-4" /> Nueva campaña
            </Button>
          ),
        }}
      >
        {() => null}
      </QueryBoundary>
    </div>
  );
}
