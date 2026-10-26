import * as React from "react";
import { PAYMENT_CURRENCIES, type PaymentCurrency } from "@nv/domain";

import { useContacts, usePaymentMethods } from "@/hooks/use-domain-data";
import { useCreatePayment } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "@/components/entities/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fromDateInput } from "@/lib/date-input";
import { methodsFor } from "@/lib/payments";

const selectCls =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

/** Create a payment request; opens its detail (instructions to send) on success. */
export function PaymentDialog({
  open,
  onOpenChange,
  defaultContactId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultContactId?: string;
  onCreated?: (id: string) => void;
}) {
  const create = useCreatePayment();
  const methods = usePaymentMethods();
  const contacts = useContacts({ pageSize: 100 });
  const [concept, setConcept] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState<PaymentCurrency>("COP");
  const [contactId, setContactId] = React.useState("");
  const [due, setDue] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setConcept("");
    setAmount("");
    // Start in the currency of the first active method, if the brand has one.
    setCurrency(methods.data?.find((m) => m.active)?.currency ?? "COP");
    setContactId(defaultContactId ?? "");
    setDue("");
    setNote("");
    setError(null);
  }, [open, defaultContactId]);

  const usable = methodsFor(methods.data ?? [], currency);

  function submit() {
    setError(null);
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setError("Escribe un monto mayor que cero.");
      return;
    }
    create.mutate(
      {
        concept: concept.trim(),
        amount: Math.round(value * 100) / 100,
        currency,
        contactId: contactId || undefined,
        dueAt: (due && fromDateInput(due)) || undefined,
        note: note.trim() || undefined,
      },
      {
        onSuccess: (p) => {
          onOpenChange(false);
          onCreated?.(p.id);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo cobro"
      description="Después te damos el mensaje con los datos de pago para enviárselo al cliente."
      onSubmit={submit}
      pending={create.isPending}
      error={error}
      submitLabel="Crear cobro"
    >
      <div className="space-y-1.5">
        <Label htmlFor="py-concept">Concepto</Label>
        <Input
          id="py-concept"
          required
          maxLength={200}
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="Plan mensual, pedido #120…"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="py-amount">Monto</Label>
          <Input
            id="py-amount"
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="150000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="py-currency">Moneda</Label>
          <select
            id="py-currency"
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
      <p className="text-xs text-ink-muted" data-testid="py-methods-hint">
        {usable.length > 0
          ? `Se podrá pagar con: ${usable.map((m) => m.label).join(", ")}.`
          : `No tienes métodos activos en ${currency}. Añade uno en «Métodos de cobro» antes de enviar el cobro.`}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="py-contact">Cliente</Label>
          <select id="py-contact" className={selectCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Sin contacto</option>
            {(contacts.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="py-due">Vence (opcional)</Label>
          <Input id="py-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="py-note">Nota interna (opcional)</Label>
        <Textarea id="py-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </FormDialog>
  );
}
