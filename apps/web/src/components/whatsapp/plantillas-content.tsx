
import * as React from "react";
import { Download, FileText, Loader2, Plus, Upload } from "lucide-react";

import { useTemplates } from "@/hooks/use-domain-data";
import { useExportTemplates, useImportTemplates } from "@/hooks/use-domain-mutations";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const exportTemplates = useExportTemplates();
  const importTemplates = useImportTemplates();
  const [open, setOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importCsvText, setImportCsvText] = React.useState("");

  const hasItems = (templates.data?.items.length ?? 0) > 0;

  const actions = (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => exportTemplates.mutate()}
        disabled={!hasItems || exportTemplates.isPending}
      >
        {exportTemplates.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}{" "}
        Exportar
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
        <Upload className="size-4" /> Importar
      </Button>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Nueva plantilla
      </Button>
    </>
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

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar plantillas (CSV)</DialogTitle>
            <DialogDescription>
              Columnas: <code>name</code>, <code>category</code>, <code>body</code> (se aceptan
              cabeceras en español). Se omiten las plantillas cuyo nombre ya existe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-panel-high file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-panel-raised"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setImportCsvText(await file.text());
              }}
            />
            <Textarea
              placeholder="…o pega aquí el contenido CSV"
              rows={6}
              value={importCsvText}
              onChange={(e) => setImportCsvText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!importCsvText.trim() || importTemplates.isPending}
              onClick={() =>
                importTemplates.mutate(importCsvText, {
                  onSuccess: () => {
                    setImportOpen(false);
                    setImportCsvText("");
                  },
                })
              }
            >
              {importTemplates.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateCreateDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
