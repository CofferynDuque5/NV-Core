import * as React from "react";
import { Clock, Lock, ShieldCheck, Sparkles } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  formatPaymentAmount,
  paymentMethodLine,
  type AccessOverview,
} from "@nv/domain";

import { usePayAccess } from "@/hooks/use-domain-mutations";
import { errorMessage } from "@/components/entities/form-dialog";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATUS_BADGE } from "@/lib/payments";

const selectCls =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

const day = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });

/** "18 h" / "45 min" left until `iso` (never negative). */
export function timeLeft(iso: string, now = Date.now()): string {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} días`;
  if (hours >= 1) return `${hours} h`;
  return `${Math.max(1, Math.ceil(ms / 60_000))} min`;
}

/**
 * Pay the plan: the operator's accounts, the amount, and a form to send the
 * transaction reference. Nothing is charged here; the operator checks their
 * own account and the brand opens when they confirm it in Cobros.
 */
export function PlanPayForm({ slug, access, canPay }: { slug: string; access: AccessOverview; canPay: boolean }) {
  const pay = usePayAccess(slug);
  const [methodId, setMethodId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { plan, methods, payment } = access;
  const waiting = payment?.status === "por_verificar";
  const price = formatPaymentAmount(plan.price, plan.currency);

  React.useEffect(() => {
    if (!methodId && methods[0]) setMethodId(methods[0].id);
  }, [methods, methodId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    pay.mutate(
      { methodId, reference: reference.trim(), note: note.trim() || undefined },
      {
        onSuccess: () => {
          setReference("");
          setNote("");
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line-soft bg-panel-raised p-4">
        <p className="text-xs text-ink-muted">Plan NV Marketing</p>
        <p className="text-ink-bright text-2xl font-semibold">{price}</p>
        <p className="text-xs text-ink-muted">por {plan.days} días de acceso completo al panel</p>
      </div>

      {payment ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="plan-payment">
          <span className="text-ink-muted">Tu último pago:</span>
          <Badge variant={STATUS_BADGE[payment.status]}>{PAYMENT_STATUS_LABEL[payment.status]}</Badge>
          <span>{formatPaymentAmount(payment.amount, payment.currency)}</span>
          {payment.reference ? <span className="text-ink-muted">· ref {payment.reference}</span> : null}
          {payment.status === "rechazado" && payment.rejectReason ? (
            <span className="text-danger w-full text-xs">Motivo: {payment.rejectReason}</span>
          ) : null}
        </div>
      ) : null}

      {waiting ? (
        <p className="flex items-start gap-2 rounded-lg bg-brand/10 p-3 text-sm">
          <ShieldCheck className="text-brand mt-0.5 size-4 shrink-0" />
          Estamos verificando tu pago. El panel se abre solo en cuanto lo confirmemos; no tienes que hacer nada más.
        </p>
      ) : methods.length === 0 ? (
        <p className="rounded-lg border border-line-soft p-3 text-sm text-ink-muted">
          Los métodos de pago aún no están configurados. Escríbenos y te ayudamos a activar tu plan.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">1. Paga {price} a una de estas cuentas</p>
            <ul className="space-y-1.5">
              {methods.map((m) => (
                <li key={m.id} className="rounded-lg border border-line-soft px-3 py-2 text-sm">
                  {paymentMethodLine(m)}
                </li>
              ))}
            </ul>
          </div>
          {canPay ? (
            <form className="space-y-3" onSubmit={submit}>
              <p className="text-sm font-medium">2. Cuéntanos cómo pagaste</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-method">Método</Label>
                  <select id="plan-method" className={selectCls} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                    {methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-reference">Referencia o número de operación</Label>
                  <Input
                    id="plan-reference"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    minLength={3}
                    maxLength={120}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-note">Nota (opcional)</Label>
                <Textarea id="plan-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {error ? <p className="text-danger text-sm">{error}</p> : null}
              <Button type="submit" disabled={pay.isPending || !methodId || reference.trim().length < 3}>
                {pay.isPending ? "Enviando…" : "Enviar pago para verificar"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-ink-muted">Pide al dueño o a un administrador de la marca que envíe el pago.</p>
          )}
        </>
      )}
    </div>
  );
}

/** Full-page lock once the trial (or paid time) is over. */
export function PlanLock({ slug, access, canPay }: { slug: string; access: AccessOverview; canPay: boolean }) {
  const wasPaid = !!access.paidUntil;
  return (
    <div className="mx-auto max-w-2xl py-6" data-testid="plan-lock">
      <Panel>
        <PanelHeader
          title={wasPaid ? "Tu plan venció" : "Tu prueba gratis de 24 horas terminó"}
          description="Tus datos siguen guardados. Activa tu plan para seguir usando el panel."
        />
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="bg-brand/10 text-brand grid size-9 shrink-0 place-items-center rounded-lg">
              <Lock className="size-4" />
            </span>
            <p className="text-sm text-ink-muted">
              {wasPaid
                ? `Tu acceso terminó el ${day(access.paidUntil!)}.`
                : "Gracias por probar NV Marketing."}{" "}
              Paga a una de nuestras cuentas, envíanos la referencia y lo activamos en cuanto veamos el pago.
            </p>
          </div>
          <PlanPayForm slug={slug} access={access} canPay={canPay} />
        </div>
      </Panel>
    </div>
  );
}

/** Thin bar above every page while the brand is on its free trial. */
export function TrialBanner({ slug, access, canPay }: { slug: string; access: AccessOverview; canPay: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  if (access.state !== "trial" || !access.trialEndsAt) return null;
  return (
    <>
      <div
        className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm print:hidden"
        data-testid="trial-banner"
      >
        <Sparkles className="text-brand size-4 shrink-0" />
        <span className="flex-1">
          Prueba gratis: te quedan <strong>{timeLeft(access.trialEndsAt)}</strong>. Todo el panel está abierto para que lo pruebes.
        </span>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Clock className="size-4" /> Activar plan
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Activa tu plan</DialogTitle>
            <DialogDescription>Si pagas antes de que termine la prueba, tus días se suman sin cortes.</DialogDescription>
          </DialogHeader>
          <PlanPayForm slug={slug} access={access} canPay={canPay} />
        </DialogContent>
      </Dialog>
    </>
  );
}
