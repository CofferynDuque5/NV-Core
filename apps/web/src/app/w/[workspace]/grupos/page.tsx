"use client";

import { Plus, Send, Users } from "lucide-react";

import { useGroups } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";

export default function GruposPage() {
  const groups = useGroups();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="WhatsApp · Audiencia"
        title="Grupos"
        description="Gestiona tus grupos de difusión."
        actions={
          <>
            <Button variant="secondary" size="sm">
              <Send className="size-4" /> Enviar a grupos
            </Button>
            <Button size="sm">
              <Plus className="size-4" /> Nuevo grupo
            </Button>
          </>
        }
      />

      <QueryBoundary
        query={groups}
        skeleton={<CardGridSkeleton count={6} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Users,
          title: "Sin grupos todavía",
          description:
            "Conecta WhatsApp y sincroniza tus grupos, o crea uno para difundir mensajes a tu audiencia.",
          action: (
            <Button size="sm">
              <Plus className="size-4" /> Nuevo grupo
            </Button>
          ),
        }}
      >
        {() => null}
      </QueryBoundary>
    </div>
  );
}
