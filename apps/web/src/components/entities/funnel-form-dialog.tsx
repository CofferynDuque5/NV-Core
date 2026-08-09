import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { FUNNEL_STEP_TYPES, type Funnel, type FunnelPage, type FunnelStepType } from "@nv/domain";

import { useCreateFunnel, useUpdateFunnel } from "@/hooks/use-domain-mutations";
import { useForms } from "@/hooks/use-domain-data";
import { STEP_TYPE_LABEL } from "@/lib/funnels";
import { FormDialog, errorMessage } from "./form-dialog";
import { AiTextButton } from "./ai-text-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-2 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

let seq = 0;
const newId = () => `st${Date.now().toString(36)}${seq++}`;

export function FunnelFormDialog({
  open,
  onOpenChange,
  funnel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  funnel?: Funnel;
}) {
  const isEdit = !!funnel;
  const create = useCreateFunnel();
  const update = useUpdateFunnel();
  const forms = useForms();
  const pending = create.isPending || update.isPending;

  const [name, setName] = React.useState("");
  const [steps, setSteps] = React.useState<FunnelPage[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(funnel?.name ?? "");
    setSteps(
      funnel?.steps ?? [
        { id: newId(), name: "Registro", type: "optin", views: 0 },
        { id: newId(), name: "Gracias", type: "thankyou", headline: "¡Listo!", views: 0 },
      ],
    );
    setError(null);
  }, [open, funnel]);

  function patchStep(i: number, patch: Partial<FunnelPage>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  }
  function move(i: number, dir: -1 | 1) {
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  }

  function submit() {
    setError(null);
    if (!name.trim()) return setError("El nombre es obligatorio.");
    if (steps.length === 0) return setError("Añade al menos un paso.");
    const bad = steps.find((s) => s.type === "optin" && !s.formId);
    if (bad) return setError(`El paso opt-in "${bad.name}" necesita un formulario.`);
    const input = { name: name.trim(), steps };
    const onSuccess = () => onOpenChange(false);
    const onError = (err: unknown) => setError(errorMessage(err));
    if (isEdit && funnel) update.mutate({ id: funnel.id, input }, { onSuccess, onError });
    else create.mutate(input, { onSuccess, onError });
  }

  const formOptions = forms.data?.items ?? [];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar embudo" : "Nuevo embudo"}
      description="Encadena páginas: opt-in → venta → gracias."
      onSubmit={submit}
      pending={pending}
      error={error}
      submitLabel={isEdit ? "Guardar" : "Crear embudo"}
    >
      <div className="space-y-1.5">
        <Label htmlFor="fn-name">Nombre</Label>
        <Input id="fn-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Pasos</Label>
        {steps.map((st, i) => (
          <div key={st.id} className="space-y-2 rounded-lg border border-line-soft bg-panel p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-ink-faint">{i + 1}</span>
              <select
                value={st.type}
                onChange={(e) => patchStep(i, { type: e.target.value as FunnelStepType })}
                className={`${selectClass} w-auto`}
                aria-label="Tipo de paso"
              >
                {FUNNEL_STEP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {STEP_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <Input
                value={st.name}
                onChange={(e) => patchStep(i, { name: e.target.value })}
                placeholder="Nombre del paso"
                className="flex-1"
              />
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

            {st.type === "optin" ? (
              <select
                value={st.formId ?? ""}
                onChange={(e) => patchStep(i, { formId: e.target.value || undefined })}
                className={selectClass}
                aria-label="Formulario"
              >
                <option value="">— Elige un formulario —</option>
                {formOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={st.headline ?? ""}
                    onChange={(e) => patchStep(i, { headline: e.target.value })}
                    placeholder="Titular"
                    className="flex-1"
                  />
                  <AiTextButton
                    text={st.headline ?? ""}
                    topic={`titular del paso "${st.name}" del embudo "${name}"`}
                    onResult={(t) => patchStep(i, { headline: t })}
                    onError={setError}
                    label="IA"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={st.body ?? ""}
                    onChange={(e) => patchStep(i, { body: e.target.value })}
                    placeholder="Texto"
                    className="flex-1"
                  />
                  <AiTextButton
                    text={st.body ?? ""}
                    topic={`texto del paso "${st.name}" del embudo "${name}"`}
                    onResult={(t) => patchStep(i, { body: t })}
                    onError={setError}
                    label="IA"
                  />
                </div>
                <Input
                  value={st.ctaLabel ?? ""}
                  onChange={(e) => patchStep(i, { ctaLabel: e.target.value })}
                  placeholder="Texto del botón (opcional)"
                />
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setSteps((s) => [...s, { id: newId(), name: "Nuevo paso", type: "sales", views: 0 }])}
          className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
        >
          <Plus className="size-4" /> Añadir paso
        </button>
      </div>
    </FormDialog>
  );
}
