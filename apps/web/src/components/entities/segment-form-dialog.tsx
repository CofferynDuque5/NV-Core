import * as React from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { CONTACT_STAGES, type Segment, type SegmentField, type SegmentRule } from "@nv/domain";

import {
  useCreateSegment,
  useSegmentPreview,
  useUpdateSegment,
} from "@/hooks/use-domain-mutations";
import {
  SEGMENT_FIELD_CATALOG,
  defaultRule,
  operatorsForField,
  reconcileRule,
  ruleValid,
  valueControl,
} from "@/lib/segments";
import { isBackendConfigured } from "@/lib/env";
import { errorMessage } from "./form-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-2 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

/** Create or edit a segment with a live rule builder + audience preview. */
export function SegmentFormDialog({
  open,
  onOpenChange,
  segment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When provided, the dialog edits this segment; otherwise it creates one. */
  segment?: Segment;
}) {
  const isEdit = !!segment;
  const create = useCreateSegment();
  const update = useUpdateSegment();
  const preview = useSegmentPreview();
  const backend = isBackendConfigured();
  const pending = create.isPending || update.isPending;

  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#5B8DEF");
  const [match, setMatch] = React.useState<Segment["match"]>("all");
  const [rules, setRules] = React.useState<SegmentRule[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Seed state whenever the dialog opens (or the target segment changes).
  React.useEffect(() => {
    if (!open) return;
    setName(segment?.name ?? "");
    setColor(segment?.color ?? "#5B8DEF");
    setMatch(segment?.match ?? "all");
    setRules(segment?.rules ?? []);
    setError(null);
  }, [open, segment]);

  const validRules = rules.filter(ruleValid);

  // Live preview: debounce and re-evaluate as valid rules / match change.
  const previewRun = preview.mutate;
  const rulesKey = JSON.stringify({ match, rules: validRules });
  React.useEffect(() => {
    if (!open || !backend) return;
    if (validRules.length === 0) return;
    const t = setTimeout(() => previewRun({ match, rules: validRules }), 350);
    return () => clearTimeout(t);
  }, [rulesKey, open, backend, previewRun, match, validRules]);

  function setRule(i: number, next: SegmentRule) {
    setRules((rs) => rs.map((r, idx) => (idx === i ? next : r)));
  }

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    const input = { name: name.trim(), color, match, rules: validRules };
    const onSuccess = () => onOpenChange(false);
    const onError = (err: unknown) => setError(errorMessage(err));
    if (isEdit && segment) {
      update.mutate({ id: segment.id, input }, { onSuccess, onError });
    } else {
      create.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar segmento" : "Nuevo segmento"}</DialogTitle>
          <DialogDescription>
            Define reglas sobre tus contactos; la audiencia se calcula sola.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          {!backend ? (
            <div className="rounded-lg border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
              Modo demo: conecta el backend (<code>VITE_API_URL</code>) para guardar.
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1 space-y-1.5">
              <Label htmlFor="sg-name">Nombre</Label>
              <Input id="sg-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sg-color">Color</Label>
              <input
                id="sg-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-line-soft bg-panel-raised"
              />
            </div>
          </div>

          {/* Match mode */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">Los contactos deben cumplir</span>
            <select
              value={match}
              onChange={(e) => setMatch(e.target.value as Segment["match"])}
              className={`${selectClass} w-auto font-medium`}
              aria-label="Modo de coincidencia"
            >
              <option value="all">todas las reglas</option>
              <option value="any">cualquier regla</option>
            </select>
          </div>

          {/* Rule rows */}
          <div className="space-y-2">
            {rules.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-soft px-3 py-3 text-center text-xs text-ink-faint">
                Sin reglas: añade una para definir la audiencia.
              </p>
            ) : (
              rules.map((rule, i) => (
                <RuleRow
                  key={i}
                  rule={rule}
                  onChange={(next) => setRule(i, next)}
                  onRemove={() => setRules((rs) => rs.filter((_, idx) => idx !== i))}
                />
              ))
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRules((rs) => [...rs, defaultRule()])}
            >
              <Plus className="size-4" /> Añadir regla
            </Button>
          </div>

          {/* Live preview */}
          {backend ? (
            <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-panel-raised px-3 py-2 text-sm">
              <Users className="size-4 text-ink-faint" />
              {validRules.length === 0 ? (
                <span className="text-ink-faint">Añade reglas para ver la audiencia.</span>
              ) : preview.isPending ? (
                <span className="flex items-center gap-1.5 text-ink-muted">
                  <Loader2 className="size-3.5 animate-spin" /> Calculando…
                </span>
              ) : preview.data ? (
                <span className="text-ink">
                  <strong className="text-ink-bright">{preview.data.count}</strong>{" "}
                  {preview.data.count === 1 ? "contacto coincide" : "contactos coinciden"}
                  {preview.data.sample.length > 0 ? (
                    <span className="text-ink-faint">
                      {" "}
                      · {preview.data.sample.slice(0, 3).map((c) => c.name).join(", ")}
                      {preview.data.count > 3 ? "…" : ""}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-ink-faint">Vista previa disponible al ajustar reglas.</span>
              )}
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-xs text-state-danger">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !backend}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? "Guardar cambios" : "Crear segmento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: SegmentRule;
  onChange: (r: SegmentRule) => void;
  onRemove: () => void;
}) {
  const ops = operatorsForField(rule.field);
  const control = valueControl(rule.operator);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-soft bg-panel p-2">
      <select
        value={rule.field}
        onChange={(e) => onChange(reconcileRule(rule, e.target.value as SegmentField))}
        className={`${selectClass} w-auto min-w-[120px] flex-1`}
        aria-label="Campo"
      >
        {SEGMENT_FIELD_CATALOG.map((f) => (
          <option key={f.field} value={f.field}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        value={rule.operator}
        onChange={(e) =>
          onChange({
            ...rule,
            operator: e.target.value as SegmentRule["operator"],
            value: valueControl(e.target.value) === "none" ? "" : rule.value,
          })
        }
        className={`${selectClass} w-auto min-w-[130px] flex-1`}
        aria-label="Operador"
      >
        {ops.map((o) => (
          <option key={o.op} value={o.op}>
            {o.label}
          </option>
        ))}
      </select>

      {control === "none" ? (
        <div className="flex-1" />
      ) : control === "stage" ? (
        <select
          value={rule.value}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
          className={`${selectClass} w-auto min-w-[120px] flex-1`}
          aria-label="Valor"
        >
          <option value="">—</option>
          {CONTACT_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : (
        <Input
          value={rule.value}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
          type={control === "number" ? "number" : control === "date" ? "date" : "text"}
          placeholder={
            control === "number" ? "días" : control === "csv" ? "Lead, Cliente" : "valor"
          }
          className="min-w-[120px] flex-1"
          aria-label="Valor"
        />
      )}

      <button
        type="button"
        onClick={onRemove}
        className="rounded-md p-1.5 text-ink-faint hover:bg-panel-raised hover:text-state-danger"
        aria-label="Quitar regla"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
