import * as React from "react";
import {
  PAYMENT_COUNTRY_LABEL,
  PAYMENT_CURRENCIES,
  PAYMENT_METHOD_CATALOG,
  paymentMethodDef,
  type PaymentCurrency,
  type PaymentMethod,
  type PaymentMethodKind,
} from "@nv/domain";

import { useSavePaymentMethod } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "@/components/entities/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const selectCls =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

const COUNTRIES = ["CO", "VE", "PE", "global"] as const;

/** Add a payment method (no `method`) or edit one. The kind is fixed once created. */
export function PaymentMethodDialog({
  open,
  onOpenChange,
  method,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  method?: PaymentMethod | null;
}) {
  const save = useSavePaymentMethod();
  const [kind, setKind] = React.useState<PaymentMethodKind>("nequi");
  const [label, setLabel] = React.useState("");
  const [currency, setCurrency] = React.useState<PaymentCurrency>("COP");
  const [details, setDetails] = React.useState<Record<string, string>>({});
  const [instructions, setInstructions] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const k = method?.kind ?? "nequi";
    setKind(k);
    setLabel(method?.label ?? paymentMethodDef(k).label);
    setCurrency(method?.currency ?? paymentMethodDef(k).currency);
    setDetails(method?.details ?? {});
    setInstructions(method?.instructions ?? "");
    setError(null);
  }, [open, method]);

  function pickKind(k: PaymentMethodKind) {
    const def = paymentMethodDef(k);
    // Follow the catalog defaults until the person types their own name.
    if (!label.trim() || label === paymentMethodDef(kind).label) setLabel(def.label);
    setCurrency(def.currency);
    setKind(k);
  }

  const def = paymentMethodDef(kind);

  function submit() {
    setError(null);
    const keys = new Set(def.fields.map((f) => f.key));
    const clean = Object.fromEntries(Object.entries(details).filter(([k]) => keys.has(k)));
    save.mutate(
      {
        id: method?.id,
        input: {
          kind,
          label: label.trim(),
          currency,
          details: clean,
          instructions: instructions.trim(),
        },
      },
      { onSuccess: () => onOpenChange(false), onError: (err) => setError(errorMessage(err)) },
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={method ? "Editar método de cobro" : "Nuevo método de cobro"}
      description="Son los datos que verá tu cliente para pagarte. La app no se conecta a tu banco ni a tu billetera."
      onSubmit={submit}
      pending={save.isPending}
      error={error}
      submitLabel={method ? "Guardar" : "Añadir método"}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pm-kind">Método</Label>
          <select
            id="pm-kind"
            className={selectCls}
            value={kind}
            disabled={!!method}
            onChange={(e) => pickKind(e.target.value as PaymentMethodKind)}
          >
            {COUNTRIES.map((c) => (
              <optgroup key={c} label={PAYMENT_COUNTRY_LABEL[c]}>
                {PAYMENT_METHOD_CATALOG.filter((d) => d.country === c).map((d) => (
                  <option key={d.kind} value={d.kind}>
                    {d.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm-currency">Moneda</Label>
          <select
            id="pm-currency"
            className={selectCls}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as PaymentCurrency)}
          >
            {PAYMENT_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pm-label">Nombre que verá el cliente</Label>
        <Input
          id="pm-label"
          required
          maxLength={80}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      {def.fields.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {def.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`pm-field-${f.key}`}>
                {f.label}
                {f.required ? <span className="text-state-danger"> *</span> : null}
              </Label>
              {f.type === "image" ? (
                <QrPicker
                  id={`pm-field-${f.key}`}
                  value={details[f.key] ?? ""}
                  onChange={(v) => setDetails({ ...details, [f.key]: v })}
                />
              ) : f.options ? (
                <select
                  id={`pm-field-${f.key}`}
                  className={selectCls}
                  required={f.required}
                  value={details[f.key] ?? ""}
                  onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
                >
                  <option value="">Elegir…</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`pm-field-${f.key}`}
                  required={f.required}
                  maxLength={200}
                  placeholder={f.placeholder}
                  value={details[f.key] ?? ""}
                  onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="pm-instructions">
          {def.fields.length === 0 ? "Cómo pagar" : "Nota para el cliente (opcional)"}
        </Label>
        <Textarea
          id="pm-instructions"
          rows={2}
          maxLength={500}
          required={def.fields.length === 0}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={
            kind === "usdt"
              ? "Envía solo por la red indicada; otra red puede perder los fondos."
              : "Ej.: escribe tu nombre en la descripción del pago."
          }
        />
      </div>
    </FormDialog>
  );
}

/** Pick the QR picture customers scan to pay (PNG, JPG or WebP up to 600 KB). */
function QrPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      return setError("Usa una imagen PNG, JPG o WebP.");
    if (file.size > 600 * 1024) return setError("La imagen pesa más de 600 KB.");
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  }
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img
          src={value}
          alt="Código QR"
          className="border-line-soft size-16 rounded-lg border bg-white object-contain"
        />
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => pick(e.target.files?.[0])}
          className="text-ink-muted file:bg-panel-raised file:text-ink block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:px-2.5 file:py-1.5"
        />
        {value ? (
          <button
            type="button"
            className="text-state-danger text-xs hover:underline"
            onClick={() => onChange("")}
          >
            Quitar QR
          </button>
        ) : null}
        {error ? <p className="text-state-danger text-xs">{error}</p> : null}
      </div>
    </div>
  );
}
