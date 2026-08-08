import * as React from "react";
import {
  CONTACT_STAGES,
  FORM_FIELD_KEYS,
  type ContactStage,
  type Form,
  type FormField,
  type FormFieldKey,
} from "@nv/domain";

import { useCreateForm, useUpdateForm } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELD_LABELS: Record<FormFieldKey, string> = {
  name: "Nombre",
  email: "Correo",
  phone: "Teléfono",
  company: "Empresa",
};

const selectClass =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

/** Create or edit a lead-capture form. */
export function FormFormDialog({
  open,
  onOpenChange,
  form,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form?: Form;
}) {
  const isEdit = !!form;
  const create = useCreateForm();
  const update = useUpdateForm();
  const pending = create.isPending || update.isPending;

  const [name, setName] = React.useState("");
  const [fields, setFields] = React.useState<FormField[]>([]);
  const [tags, setTags] = React.useState("");
  const [stage, setStage] = React.useState<ContactStage>("Lead");
  const [successMessage, setSuccessMessage] = React.useState("");
  const [redirectUrl, setRedirectUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(form?.name ?? "");
    setFields(
      form?.fields ?? [
        { key: "name", label: "Nombre", required: true },
        { key: "email", label: "Correo", required: true },
      ],
    );
    setTags((form?.tags ?? []).join(", "));
    setStage(form?.stage ?? "Lead");
    setSuccessMessage(form?.successMessage ?? "¡Gracias! Te contactaremos pronto.");
    setRedirectUrl(form?.redirectUrl ?? "");
    setError(null);
  }, [open, form]);

  function toggleField(key: FormFieldKey) {
    setFields((fs) =>
      fs.some((f) => f.key === key)
        ? fs.filter((f) => f.key !== key)
        : [...fs, { key, label: FIELD_LABELS[key], required: key === "email" }],
    );
  }
  function toggleRequired(key: FormFieldKey) {
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, required: !f.required } : f)));
  }

  function submit() {
    setError(null);
    if (!name.trim()) return setError("El nombre es obligatorio.");
    if (fields.length === 0) return setError("Elige al menos un campo a capturar.");
    const input = {
      name: name.trim(),
      fields,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      stage,
      successMessage: successMessage.trim() || "¡Gracias!",
      redirectUrl: redirectUrl.trim() || undefined,
    };
    const onSuccess = () => onOpenChange(false);
    const onError = (err: unknown) => setError(errorMessage(err));
    if (isEdit && form) update.mutate({ id: form.id, input }, { onSuccess, onError });
    else create.mutate(input, { onSuccess, onError });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar formulario" : "Nuevo formulario"}
      description="Captura leads y conviértelos en contactos automáticamente."
      onSubmit={submit}
      pending={pending}
      error={error}
      submitLabel={isEdit ? "Guardar" : "Crear formulario"}
    >
      <div className="space-y-1.5">
        <Label htmlFor="fm-name">Nombre</Label>
        <Input id="fm-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Campos a capturar</Label>
        <div className="space-y-1.5">
          {FORM_FIELD_KEYS.map((key) => {
            const active = fields.find((f) => f.key === key);
            return (
              <div key={key} className="flex items-center gap-3 rounded-lg border border-line-soft px-3 py-2">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!active} onChange={() => toggleField(key)} />
                  {FIELD_LABELS[key]}
                </label>
                {active ? (
                  <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                    <input
                      type="checkbox"
                      checked={active.required}
                      onChange={() => toggleRequired(key)}
                    />
                    Obligatorio
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="fm-stage">Etapa del contacto</Label>
          <select
            id="fm-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as ContactStage)}
            className={selectClass}
          >
            {CONTACT_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fm-tags">Etiquetas (coma)</Label>
          <Input
            id="fm-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="webinar, vip"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fm-success">Mensaje de éxito</Label>
        <Input
          id="fm-success"
          value={successMessage}
          onChange={(e) => setSuccessMessage(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fm-redirect">Redirección tras enviar (opcional)</Label>
        <Input
          id="fm-redirect"
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.target.value)}
          placeholder="https://…/gracias"
        />
      </div>
    </FormDialog>
  );
}
