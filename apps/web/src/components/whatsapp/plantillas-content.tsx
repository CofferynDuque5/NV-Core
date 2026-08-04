"use client";

import * as React from "react";
import { FileText, Plus } from "lucide-react";

import { useTemplates } from "@/hooks/use-domain-data";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TemplateCreateDialog } from "@/components/entities/template-create-dialog";

/** Highlight {{variables}} inside a template body preview. */
function renderBodyWithVars(body: string): React.ReactNode {
  return body.split(/(\{\{\s*[\w.-]+\s*\}\})/g).map((part, i) =>
    /^\{\{\s*[\w.-]+\s*\}\}$/.test(part) ? (
      <code key={i} className="rounded bg-brand/10 px-1 text-brand">
        {part}
      </code>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export function PlantillasContent({ showHeader = true }: { showHeader?: boolean }) {
  const templates = useTemplates();
  const [open, setOpen] = React.useState(false);

  const actions = (
    <Button size="sm" onClick={() => setOpen(true)}>
      <Plus className="size-4" /> Nueva plantilla
    </Button>
  );

  return (
    <div className="space-y-6">
      {showHeader ? (
        <PageHeader
          eyebrow="Mensajes reutilizables"
          title="Plantillas"
          description="Guarda mensajes que uses con frecuencia."
          actions={actions}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}

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
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Nueva plantilla
            </Button>
          ),
        }}
      >
        {(data) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((t) => (
              <Panel key={t.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-ink-bright">{t.name}</h3>
                  {t.category ? <Badge variant="neutral">{t.category}</Badge> : null}
                </div>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-muted">
                  {renderBodyWithVars(t.body)}
                </p>
              </Panel>
            ))}
          </div>
        )}
      </QueryBoundary>

      <TemplateCreateDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
