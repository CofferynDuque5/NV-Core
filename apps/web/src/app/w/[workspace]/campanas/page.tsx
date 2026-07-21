"use client";

import * as React from "react";
import { Megaphone, Plus } from "lucide-react";

import { useCampaigns } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { CampaignCreateDialog } from "@/components/entities/campaign-create-dialog";

export default function CampanasPage() {
  const campaigns = useCampaigns();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Campañas"
        description="Planifica, lanza y monitorea tus campañas omnicanal."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
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
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Nueva campaña
            </Button>
          ),
        }}
      >
        {() => null}
      </QueryBoundary>

      <CampaignCreateDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
