import * as React from "react";
import { Eraser } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { useSampleData } from "@/hooks/use-domain-data";
import { useRemoveSampleData } from "@/hooks/use-domain-mutations";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const LABELS: Record<string, [string, string]> = {
  contacts: ["contacto", "contactos"],
  automations: ["automatización", "automatizaciones"],
  segments: ["segmento", "segmentos"],
  forms: ["formulario", "formularios"],
  funnels: ["embudo", "embudos"],
  sequences: ["secuencia", "secuencias"],
  affiliates: ["afiliado", "afiliados"],
};

/** "10 contactos, 3 automatizaciones y 2 embudos" from the example-data counts. */
export function describeSample(counts: Record<string, number>): string {
  const parts = Object.entries(LABELS)
    .filter(([k]) => (counts[k] ?? 0) > 0)
    .map(([k, [one, many]]) => `${counts[k]} ${counts[k] === 1 ? one : many}`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/**
 * Shown while the brand still holds the example streaming-shop records that
 * older versions created on sign-up (fake contacts and automations marked
 * active). Owners and Admins can remove them in one step.
 */
export function SampleDataBanner({ slug }: { slug: string }) {
  const { data } = useSampleData(slug);
  const remove = useRemoveSampleData(slug);
  const role = useAuthStore((s) => s.memberships.find((m) => m.workspaceSlug === slug)?.role);
  const superAdmin = useAuthStore((s) => s.superAdmin);
  const [open, setOpen] = React.useState(false);
  if (!data?.present) return null;
  const canRemove = superAdmin || role === "Owner" || role === "Admin";
  const what = describeSample(data.counts);

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border border-state-warning/30 bg-state-warning/10 px-4 py-3 text-sm"
        data-testid="sample-data-banner"
      >
        <Eraser className="size-4 shrink-0 text-state-warning" />
        <p className="min-w-0 flex-1">
          Esta marca todavía tiene <strong>datos de ejemplo</strong> ({what}). No son clientes reales y pueden inflar tus
          números.
        </p>
        {canRemove ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Quitar datos de ejemplo
          </Button>
        ) : (
          <span className="text-xs text-ink-muted">Pide a un administrador que los quite.</span>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Quitar los datos de ejemplo?</DialogTitle>
            <DialogDescription>
              Se borran solo los registros de ejemplo ({what}). Lo que tú creaste no se toca. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: () => setOpen(false) })}
            >
              {remove.isPending ? "Quitando…" : "Sí, quitarlos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
