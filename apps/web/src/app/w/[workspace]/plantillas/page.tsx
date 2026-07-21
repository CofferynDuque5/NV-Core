"use client";

import { FileText, Plus } from "lucide-react";

import { useTemplates } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";

export default function PlantillasPage() {
  const templates = useTemplates();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensajes reutilizables"
        title="Plantillas"
        description="Guarda mensajes que uses con frecuencia."
        actions={
          <Button size="sm">
            <Plus className="size-4" /> Nueva plantilla
          </Button>
        }
      />

      <QueryBoundary
        query={templates}
        skeleton={<CardGridSkeleton count={6} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: FileText,
          title: "Sin plantillas",
          description:
            "Crea plantillas de mensajes con variables para responder e iniciar conversaciones más rápido.",
          action: (
            <Button size="sm">
              <Plus className="size-4" /> Nueva plantilla
            </Button>
          ),
        }}
      >
        {() => null}
      </QueryBoundary>
    </div>
  );
}
