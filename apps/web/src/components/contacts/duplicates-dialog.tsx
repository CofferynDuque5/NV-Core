import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Contact } from "@nv/domain";
import { Loader2, Merge } from "lucide-react";
import { toast } from "sonner";

import { useServices } from "@/hooks/use-services";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const day = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });

/**
 * «Fusionar duplicados»: contacts sharing a phone or email, grouped. Pick the
 * one to keep; the others pass it their data, notes, tasks and payments.
 */
export function DuplicatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [ws.id, "contacts", "duplicates"],
    queryFn: () => svc.contacts.duplicates(ws.id),
    enabled: open,
  });
  const [keep, setKeep] = React.useState<Record<number, string>>({});
  const [busy, setBusy] = React.useState<number | null>(null);
  const groups = q.data?.groups ?? [];

  async function merge(i: number, group: Contact[]) {
    const keepId = keep[i] ?? group[0]!.id;
    setBusy(i);
    try {
      await svc.contacts.merge(ws.id, keepId, group.filter((c) => c.id !== keepId).map((c) => c.id));
      toast.success(`${group.length} contactos fusionados en uno`);
      setKeep({});
      await qc.invalidateQueries({ queryKey: [ws.id, "contacts"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fusionar contactos duplicados</DialogTitle>
          <DialogDescription>
            Estos contactos comparten teléfono o correo. Elige cuál conservar: recibe los datos que le falten, las etiquetas,
            notas, tareas y cobros de los otros, que se borran. Si alguno pidió no recibir mensajes, se respeta.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1" data-testid="duplicates-list">
          {q.isLoading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="text-ink-faint size-5 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-ink-muted py-6 text-center text-sm">No hay duplicados: cada teléfono y correo está una sola vez.</p>
          ) : (
            groups.map((g, i) => (
              <div key={g.map((c) => c.id).join()} className="border-line-soft rounded-lg border p-3" data-testid="duplicate-group">
                <ul className="space-y-1.5">
                  {g.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name={`keep-${i}`}
                          className="mt-1 accent-[#5F86F2]"
                          checked={(keep[i] ?? g[0]!.id) === c.id}
                          onChange={() => setKeep((k) => ({ ...k, [i]: c.id }))}
                        />
                        <span className="min-w-0">
                          <span className="text-ink font-medium">{c.name}</span>
                          <span className="text-ink-muted block text-xs">
                            {[c.phone, c.email, c.company].filter(Boolean).join(" · ") || "Sin datos"} · {c.stage} · desde{" "}
                            {day(c.createdAt)}
                            {c.tags.length ? ` · ${c.tags.join(", ")}` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void merge(i, g)} data-testid="duplicate-merge">
                    {busy === i ? <Loader2 className="size-4 animate-spin" /> : <Merge className="size-4" />}
                    Fusionar {g.length} en uno
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
