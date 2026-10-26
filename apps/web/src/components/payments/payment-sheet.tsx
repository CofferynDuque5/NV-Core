import * as React from "react";
import { Check, Copy } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_TRANSITIONS,
  formatPaymentAmount,
  paymentInstructions,
  type PaymentMethod,
  type PaymentRequest,
  type PaymentStatus,
} from "@nv/domain";

import { useUpdatePayment } from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { errorMessage } from "@/components/entities/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { STATUS_BADGE, methodsFor } from "@/lib/payments";

const selectCls =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

const when = (iso: string) =>
  new Date(iso).toLocaleString("es", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Button text for each manual status change. */
const ACTION: Partial<Record<PaymentStatus, Partial<Record<PaymentStatus, string>>>> = {
  pendiente: { por_verificar: "El cliente dice que ya pagó", pagado: "Confirmar pago", cancelado: "Cancelar cobro" },
  por_verificar: { pagado: "Confirmar pago", rechazado: "Rechazar", pendiente: "Volver a pendiente" },
  rechazado: { por_verificar: "Volver a verificar", pendiente: "Volver a pendiente", cancelado: "Cancelar cobro" },
  pagado: { por_verificar: "Deshacer confirmación" },
  cancelado: { pendiente: "Reabrir cobro" },
};

/**
 * One payment request: the message to send the customer (copy, never sent by
 * the app) and the manual verification — method used, reference, confirm or
 * reject.
 */
export function PaymentSheet({
  payment,
  methods,
  onClose,
}: {
  payment: PaymentRequest | null;
  methods: PaymentMethod[];
  onClose: () => void;
}) {
  const update = useUpdatePayment();
  const confirm = useConfirm();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [methodId, setMethodId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [rejecting, setRejecting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const offer = payment ? methodsFor(methods, payment.currency) : [];
  const offerKey = offer.map((m) => m.id).join(",");

  React.useEffect(() => {
    if (!payment) return;
    setSelected(offerKey ? offerKey.split(",") : []);
    setMethodId(payment.methodId ?? "");
    setReference(payment.reference ?? "");
    setReason(payment.rejectReason ?? "");
    setRejecting(false);
    setCopied(false);
    setError(null);
  }, [payment?.id, offerKey]);

  if (!payment) return <Sheet open={false} />;

  const closed = payment.status === "pagado" || payment.status === "cancelado";
  const message = paymentInstructions({
    contactName: payment.contactName,
    concept: payment.concept,
    amount: payment.amount,
    currency: payment.currency,
    methods: offer.filter((m) => selected.includes(m.id)),
  });

  async function copy() {
    await navigator.clipboard?.writeText(message).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function move(to: PaymentStatus) {
    if (!payment) return;
    setError(null);
    if (to === "rechazado" && !rejecting) {
      setRejecting(true);
      return;
    }
    if (to === "pagado") {
      const ok = await confirm({
        title: "Confirmar pago",
        description: `¿Ya viste ${formatPaymentAmount(payment.amount, payment.currency)} en tu cuenta? Confírmalo solo después de revisarlo en tu banco o billetera; la captura sola no basta.`,
        confirmLabel: "Sí, lo recibí",
      });
      if (!ok) return;
    }
    if (payment.status === "pagado") {
      const ok = await confirm({
        title: "Deshacer confirmación",
        description: "El cobro vuelve a «Por verificar». Queda registrado en el historial de auditoría.",
        confirmLabel: "Deshacer",
        destructive: true,
      });
      if (!ok) return;
    }
    update.mutate(
      {
        id: payment.id,
        input: {
          status: to,
          ...(closed ? {} : { methodId: methodId || null, reference: reference.trim() || null }),
          ...(to === "rechazado" ? { rejectReason: reason.trim() } : {}),
        },
      },
      { onSuccess: () => setRejecting(false), onError: (err) => setError(errorMessage(err)) },
    );
  }

  function saveDetails() {
    if (!payment) return;
    setError(null);
    update.mutate(
      { id: payment.id, input: { methodId: methodId || null, reference: reference.trim() || null } },
      { onError: (err) => setError(errorMessage(err)) },
    );
  }

  const actions = PAYMENT_TRANSITIONS[payment.status];

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" data-testid="payment-sheet">
        <SheetHeader>
          <SheetTitle>{payment.concept}</SheetTitle>
          <SheetDescription>
            {payment.contactName ? `${payment.contactName} · ` : ""}creado el {when(payment.createdAt)} por {payment.createdBy}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl font-semibold text-ink-bright">
              {formatPaymentAmount(payment.amount, payment.currency)}
            </span>
            <Badge variant={STATUS_BADGE[payment.status]}>{PAYMENT_STATUS_LABEL[payment.status]}</Badge>
          </div>
          {payment.status === "pagado" && payment.paidAt ? (
            <p className="text-xs text-state-success">
              Confirmado por {payment.verifiedBy} el {when(payment.paidAt)}
              {payment.methodLabel ? ` · ${payment.methodLabel}` : ""}
              {payment.reference ? ` · ref. ${payment.reference}` : ""}
            </p>
          ) : null}
          {payment.status === "rechazado" && payment.rejectReason ? (
            <p className="text-xs text-state-danger">Rechazado: {payment.rejectReason}</p>
          ) : null}
          {payment.note ? <p className="text-xs text-ink-muted">Nota: {payment.note}</p> : null}

          {!closed ? (
            <section className="space-y-2" data-testid="payment-message">
              <h3 className="text-sm font-semibold text-ink-bright">Mensaje para el cliente</h3>
              {offer.length === 0 ? (
                <p className="text-xs text-state-warning">
                  No tienes métodos activos en {payment.currency}. Añade uno en «Métodos de cobro».
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {offer.map((m) => (
                      <label key={m.id} className="flex items-center gap-1.5 text-xs text-ink">
                        <input
                          type="checkbox"
                          checked={selected.includes(m.id)}
                          onChange={(e) =>
                            setSelected(e.target.checked ? [...selected, m.id] : selected.filter((x) => x !== m.id))
                          }
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                  <Textarea readOnly rows={9} value={message} className="text-xs" aria-label="Mensaje para el cliente" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-ink-faint">Cópialo y envíalo por WhatsApp, Telegram o el Inbox. La app no lo envía sola.</p>
                    <Button size="sm" variant="secondary" onClick={copy} disabled={selected.length === 0}>
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copied ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          <section className="space-y-3" data-testid="payment-verify">
            <h3 className="text-sm font-semibold text-ink-bright">Verificación</h3>
            {!closed ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pv-method">Método que usó</Label>
                  <select id="pv-method" className={selectCls} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                    <option value="">Sin indicar</option>
                    {methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                        {m.active ? "" : " (pausado)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pv-reference">Referencia del pago</Label>
                  <Input
                    id="pv-reference"
                    maxLength={120}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Nº de comprobante"
                  />
                </div>
              </div>
            ) : null}
            {rejecting ? (
              <div className="space-y-1.5">
                <Label htmlFor="pv-reason">Motivo del rechazo</Label>
                <Input
                  id="pv-reason"
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="No llegó a la cuenta, monto incompleto…"
                />
              </div>
            ) : null}
            {error ? <p className="text-xs text-state-danger">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              {actions.map((to) => (
                <Button
                  key={to}
                  size="sm"
                  variant={to === "pagado" ? "default" : to === "rechazado" || to === "cancelado" ? "ghost" : "secondary"}
                  disabled={update.isPending || (to === "rechazado" && rejecting && !reason.trim())}
                  onClick={() => void move(to)}
                >
                  {rejecting && to === "rechazado" ? "Confirmar rechazo" : (ACTION[payment.status]?.[to] ?? PAYMENT_STATUS_LABEL[to])}
                </Button>
              ))}
              {!closed ? (
                <Button size="sm" variant="ghost" disabled={update.isPending} onClick={saveDetails}>
                  Guardar datos
                </Button>
              ) : null}
            </div>
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
