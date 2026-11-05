import * as React from "react";
import {
  CONTACT_FIELD_TYPES,
  CONTACT_FIELD_TYPE_LABELS,
  MAX_CONTACT_FIELDS,
  fieldKeyFor,
  type ContactFieldDef,
  type ContactFieldType,
} from "@nv/domain";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { useContactFields } from "@/hooks/use-domain-data";
import { useSaveContactFields } from "@/hooks/use-domain-mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Row {
  key?: string;
  label: string;
  type: ContactFieldType;
  options: string;
}

const toRow = (f: ContactFieldDef): Row => ({ key: f.key, label: f.label, type: f.type, options: (f.options ?? []).join(", ") });

const selectClass = "h-9 rounded-lg border border-line-soft bg-panel-raised px-2 text-sm text-ink";

/**
 * «Campos personalizados»: the brand's own contact fields (talla, ciudad,
 * plan…). They show in each contact's form and card, in the CSV export and as
 * segment rules. Renaming keeps the stored values; deleting hides them.
 */
export function ContactFieldsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const fields = useContactFields();
  const save = useSaveContactFields();
  const [rows, setRows] = React.useState<Row[]>([]);

  React.useEffect(() => {
    if (open) setRows((fields.data ?? []).map(toRow));
  }, [open, fields.data]);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function submit() {
    const taken = new Set(rows.map((r) => r.key).filter((k): k is string => !!k));
    const defs: ContactFieldDef[] = rows
      .filter((r) => r.label.trim())
      .map((r) => {
        const key = r.key ?? fieldKeyFor(r.label, taken);
        taken.add(key);
        return {
          key,
          label: r.label.trim(),
          type: r.type,
          ...(r.type === "select"
            ? { options: r.options.split(",").map((o) => o.trim()).filter(Boolean) }
            : {}),
        };
      });
    save.mutate(defs, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Campos personalizados</DialogTitle>
          <DialogDescription>
            Datos propios de tu negocio para cada contacto, como ciudad, talla o plan. Salen en la ficha, al exportar y en las
            reglas de Segmentos.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1" data-testid="contact-fields-list">
          {rows.length === 0 ? (
            <p className="text-sm text-ink-faint">Todavía no hay campos. Añade el primero.</p>
          ) : null}
          {rows.map((r, i) => (
            <div key={r.key ?? `new-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-line-soft p-2">
              <Input
                value={r.label}
                onChange={(e) => set(i, { label: e.target.value })}
                placeholder="Nombre del campo"
                aria-label={`Nombre del campo ${i + 1}`}
                className="min-w-[160px] flex-1"
                maxLength={40}
              />
              <select
                value={r.type}
                onChange={(e) => set(i, { type: e.target.value as ContactFieldType })}
                className={selectClass}
                aria-label={`Tipo del campo ${i + 1}`}
              >
                {CONTACT_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONTACT_FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              {r.type === "select" ? (
                <Input
                  value={r.options}
                  onChange={(e) => set(i, { options: e.target.value })}
                  placeholder="Opciones separadas por coma"
                  aria-label={`Opciones del campo ${i + 1}`}
                  className="min-w-[200px] flex-1"
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar el campo ${r.label || i + 1}`}
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={rows.length >= MAX_CONTACT_FIELDS}
            onClick={() => setRows((rs) => [...rs, { label: "", type: "text", options: "" }])}
          >
            <Plus className="size-4" /> Añadir campo
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={save.isPending} data-testid="contact-fields-save">
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Guardar campos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
