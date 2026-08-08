
import * as React from "react";
import { toast } from "sonner";
import { Copy, DollarSign, ExternalLink, Handshake, Pencil, Plus, Trash2 } from "lucide-react";
import type { Affiliate } from "@nv/domain";

import { useAffiliates } from "@/hooks/use-domain-data";
import { useConvertAffiliate, useDeleteAffiliate } from "@/hooks/use-domain-mutations";
import { conversionRate, money, referralLink } from "@/lib/affiliates";
import { API_URL } from "@/lib/env";
import { PageHeader } from "@/components/common/page-header";
import { QueryBoundary } from "@/components/common/query-boundary";
import { CardGridSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { AffiliateFormDialog } from "@/components/entities/affiliate-form-dialog";

export default function AfiliadosPage() {
  const affiliates = useAffiliates();
  const del = useDeleteAffiliate();
  const convert = useConvertAffiliate();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Affiliate | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  function recordConversion(a: Affiliate) {
    const raw = prompt(`Registrar una venta atribuida a "${a.name}". Importe de la venta:`);
    if (raw == null) return;
    const amount = Number(raw.replace(/,/g, "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Importe no válido");
      return;
    }
    convert.mutate({ id: a.id, amount });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Programa de afiliados"
        title="Afiliados"
        description="Socios con enlace de referido único, seguimiento de clics y comisión por conversión."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> Nuevo afiliado
          </Button>
        }
      />

      <QueryBoundary
        query={affiliates}
        skeleton={<CardGridSkeleton count={3} />}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          icon: Handshake,
          title: "Sin afiliados",
          description:
            "Da de alta a un socio para generar su enlace de referido y registrar clics, conversiones y comisiones.",
          action: (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Nuevo afiliado
            </Button>
          ),
        }}
      >
        {(d) => (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {d.items.map((a) => {
              const link = referralLink(API_URL, a.code);
              return (
                <div
                  key={a.id}
                  className="group flex flex-col gap-3 rounded-xl border border-line-soft bg-panel p-4 transition-colors hover:border-line-bright"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-bright">{a.name}</div>
                      <div className="truncate text-[11px] text-ink-faint">{a.email}</div>
                    </div>
                    <span
                      className={
                        a.status === "active"
                          ? "whitespace-nowrap rounded-full bg-state-success/15 px-2 py-0.5 text-[11px] font-medium text-state-success"
                          : "whitespace-nowrap rounded-full bg-line-strong/60 px-2 py-0.5 text-[11px] font-medium text-ink-muted"
                      }
                    >
                      {a.status === "active" ? "Activo" : "Pausado"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <code className="rounded-md bg-panel-raised px-1.5 py-0.5 text-ink-muted">{a.code}</code>
                    <span className="rounded-md bg-panel-raised px-2 py-0.5 text-ink-muted">
                      {a.commissionPct}% comisión
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <Stat label="Clics" value={String(a.clicks)} />
                    <Stat label="Ventas" value={String(a.conversions)} />
                    <Stat label="Conv." value={`${conversionRate(a)}%`} />
                    <Stat label="Ganado" value={money(a.earnings)} />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => copy(link, "Enlace")}>
                      <Copy className="size-3.5" /> Enlace
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={convert.isPending}
                      onClick={() => recordConversion(a)}
                    >
                      <DollarSign className="size-3.5" /> Venta
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={link} target="_blank" rel="noreferrer" aria-label="Abrir enlace de referido">
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  </div>

                  <div className="mt-auto flex items-center justify-end gap-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(a);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={del.isPending}
                      onClick={() => {
                        if (confirm(`¿Eliminar al afiliado "${a.name}"?`)) del.mutate(a.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </QueryBoundary>

      <AffiliateFormDialog open={open} onOpenChange={setOpen} affiliate={editing} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-panel-raised px-1.5 py-1.5">
      <div className="truncate text-sm font-semibold text-ink-bright">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
