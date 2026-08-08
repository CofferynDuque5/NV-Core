import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  SEQUENCE_CHANNELS,
  type Sequence,
  type SequenceChannel,
  type SequenceStep,
} from "@nv/domain";

import { useCreateSequence, useUpdateSequence } from "@/hooks/use-domain-mutations";
import { CHANNEL_LABEL, stepOffsets, stepWhen } from "@/lib/sequences";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-2 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

let seq = 0;
const newId = () => `sq${Date.now().toString(36)}${seq++}`;

export function SequenceFormDialog({
  open,
  onOpenChange,
  sequence,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sequence?: Sequence;
}) {
  const isEdit = !!sequence;
  const create = useCreateSequence();
  const update = useUpdateSequence();
  const pending = create.isPending || update.isPending;

  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<Sequence["status"]>("active");
  const [steps, setSteps] = React.useState<SequenceStep[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(sequence?.name ?? "");
    setStatus(sequence?.status ?? "active");
    setSteps(
      sequence?.steps ?? [{ id: newId(), delayDays: 0, channel: "email", body: "" }],
    );
    setError(null);
  }, [open, sequence]);

  const offsets = stepOffsets(steps);

  function patch(i: number, p: Partial<SequenceStep>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...p } : st)));
  }
  function move(i: number, dir: -1 | 1) {
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const c = [...s];
      [c[i], c[j]] = [c[j]!, c[i]!];
      return c;
    });
  }

  function submit() {
    setError(null);
    if (!name.trim()) return setError("El nombre es obligatorio.");
    if (steps.length === 0) return setError("Añade al menos un paso.");
    if (steps.some((s) => !s.body.trim())) return setError("Cada paso necesita un mensaje.");
    const input = { name: name.trim(), status, steps };
    const onSuccess = () => onOpenChange(false);
    const onError = (err: unknown) => setError(errorMessage(err));
    if (isEdit && sequence) update.mutate({ id: sequence.id, input }, { onSuccess, onError });
    else create.mutate(input, { onSuccess, onError });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar secuencia" : "Nueva secuencia"}
      description="Mensajes automáticos por pasos con retraso entre ellos."
      onSubmit={submit}
      pending={pending}
      error={error}
      submitLabel={isEdit ? "Guardar" : "Crear secuencia"}
    >
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="sq-name">Nombre</Label>
          <Input id="sq-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sq-status">Estado</Label>
          <select
            id="sq-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Sequence["status"])}
            className={`${selectClass} w-auto`}
          >
            <option value="active">Activa</option>
            <option value="paused">Pausada</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Pasos</Label>
        {steps.map((st, i) => (
          <div key={st.id} className="space-y-2 rounded-lg border border-line-soft bg-panel p-2.5">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] font-semibold text-ink-faint">
                {stepWhen(offsets[i] ?? 0)}
              </span>
              <label className="flex items-center gap-1 text-[11px] text-ink-muted">
                +
                <Input
                  type="number"
                  min={0}
                  value={st.delayDays}
                  onChange={(e) => patch(i, { delayDays: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 w-16"
                />
                d
              </label>
              <select
                value={st.channel}
                onChange={(e) => patch(i, { channel: e.target.value as SequenceChannel })}
                className={`${selectClass} w-auto`}
                aria-label="Canal"
              >
                {SEQUENCE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </select>
              <div className="ml-auto flex items-center">
                <button type="button" onClick={() => move(i, -1)} className="p-1 text-ink-faint hover:text-ink" aria-label="Subir">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" onClick={() => move(i, 1)} className="p-1 text-ink-faint hover:text-ink" aria-label="Bajar">
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))}
                  className="p-1 text-ink-faint hover:text-state-danger"
                  aria-label="Quitar paso"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            {st.channel === "email" ? (
              <Input
                value={st.subject ?? ""}
                onChange={(e) => patch(i, { subject: e.target.value })}
                placeholder="Asunto (email)"
              />
            ) : null}
            <Input
              value={st.body}
              onChange={(e) => patch(i, { body: e.target.value })}
              placeholder="Mensaje… (usa {{nombre}})"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setSteps((s) => [...s, { id: newId(), delayDays: 2, channel: "email", body: "" }])
          }
          className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
        >
          <Plus className="size-4" /> Añadir paso
        </button>
      </div>
    </FormDialog>
  );
}
