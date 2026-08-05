
import * as React from "react";
import { Filter, Plus } from "lucide-react";

import { useSegments } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { SegmentCreateDialog } from "@/components/entities/segment-create-dialog";

export default function SegmentosPage() {
  const segments = useSegments();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audiencia dinámica"
        title="Segmentos"
        description="Audiencias que se actualizan solas según reglas."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Nuevo segmento
          </Button>
        }
      />

      <QueryBoundary
        query={segments}
        skeleton={<CardGridSkeleton count={4} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Filter,
          title: "Sin segmentos",
          description:
            "Crea un segmento con reglas (servicio, estado, etiquetas, actividad…) para lanzar campañas dirigidas.",
          action: (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Nuevo segmento
            </Button>
          ),
        }}
      >
        {() => null}
      </QueryBoundary>

      <SegmentCreateDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
