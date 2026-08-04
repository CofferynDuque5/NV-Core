"use client";

import * as React from "react";
import type { SendLogEntry } from "@nv/domain";
import { BarChart2, Download, History, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { useCampaignLogs } from "@/hooks/use-domain-data";
import { useServices } from "@/hooks/use-services";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { TableSkeleton } from "@/components/common/skeletons";
import { Panel } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const COLUMNS = ["Fecha", "Campaña", "Destino", "Estado", "Detalle", ""];

const SOCIAL_TARGETS = new Set(["facebook", "instagram"]);

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function destination(entry: SendLogEntry): string {
  return entry.groupName ?? entry.target ?? "—";
}

const CSV_COLUMNS: { key: keyof SendLogEntry; label: string }[] = [
  { key: "createdAt", label: "Fecha" },
  { key: "campaignName", label: "Campaña" },
  { key: "groupName", label: "Grupo" },
  { key: "target", label: "Destino" },
  { key: "format", label: "Formato" },
  { key: "postId", label: "PostId" },
  { key: "ok", label: "OK" },
  { key: "error", label: "Error" },
  { key: "preview", label: "Mensaje" },
];

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(rows: SendLogEntry[]): void {
  const header = CSV_COLUMNS.map((c) => c.label).join(",");
  const body = rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c.key])).join(",")).join("\n");
  const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `historial-nv-core-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function HistorialContent({ showHeader = true }: { showHeader?: boolean }) {
  const logs = useCampaignLogs();
  const [insights, setInsights] = React.useState<{ target: string; id: string } | null>(null);
  const rows = logs.data ?? [];

  const actions = (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => downloadCsv(rows)}
      disabled={rows.length === 0}
    >
      <Download className="size-4" /> Exportar CSV
    </Button>
  );

  return (
    <div className="space-y-6">
      {showHeader ? (
        <PageHeader
          eyebrow="Operaciones"
          title="Historial"
          description="Registro de envíos a grupos de WhatsApp y publicaciones sociales."
          actions={actions}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}

      <QueryBoundary
        query={logs}
        skeleton={<TableSkeleton rows={8} cols={6} />}
        isEmpty={(d) => d.length === 0}
        empty={{
          icon: History,
          title: "Sin envíos todavía",
          description:
            "Cuando ejecutes una campaña o publiques en redes, cada intento aparecerá aquí con su resultado.",
        }}
      >
        {(data) => (
          <Panel className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-faint">
                  {COLUMNS.map((c, i) => (
                    <th key={i} className="px-4 py-3 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((entry) => {
                  const target = entry.target ?? "";
                  const showMetrics = SOCIAL_TARGETS.has(target) && Boolean(entry.postId);
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-line last:border-0 align-top hover:bg-panel-raised/40"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                        {formatDate(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-ink">{entry.campaignName ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-muted">{destination(entry)}</td>
                      <td className="px-4 py-3">
                        {entry.ok ? (
                          <Badge variant="success">OK</Badge>
                        ) : (
                          <Badge variant="danger">Error</Badge>
                        )}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-ink-muted">
                        <span className={entry.ok ? undefined : "text-state-danger"}>
                          {entry.ok ? (entry.preview ?? "—") : (entry.error ?? "—")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {showMetrics ? (
                          <button
                            onClick={() =>
                              setInsights({ target, id: entry.postId as string })
                            }
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-panel-high hover:text-ink"
                            title="Ver métricas"
                          >
                            <BarChart2 className="size-4" /> Métricas
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )}
      </QueryBoundary>

      <InsightsDialog insights={insights} onClose={() => setInsights(null)} />
    </div>
  );
}

function InsightsDialog({
  insights,
  onClose,
}: {
  insights: { target: string; id: string } | null;
  onClose: () => void;
}) {
  const svc = useServices();
  const ws = useWorkspace();
  const open = insights !== null;

  const query = useQuery({
    queryKey: [ws.id, "social", "insights", insights?.target, insights?.id],
    queryFn: () => svc.social.insights(ws.id, insights!.target, insights!.id),
    enabled: open,
  });

  const metrics = query.data?.metrics ?? {};
  const entries = Object.entries(metrics);

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Métricas</DialogTitle>
          <DialogDescription>
            {insights ? `${insights.target} · ${insights.id}` : "Métricas de la publicación."}
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" /> Cargando métricas…
          </div>
        ) : query.isError ? (
          <p className="rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-xs text-state-danger">
            No se pudieron cargar las métricas.
          </p>
        ) : entries.length === 0 ? (
          <p className="py-4 text-sm text-ink-muted">No hay métricas disponibles.</p>
        ) : (
          <dl className="divide-y divide-line">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <dt className="text-ink-muted">{key}</dt>
                <dd className="font-medium text-ink">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
