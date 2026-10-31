import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  FileText,
  Lock,
  Upload,
  X,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  NO_REFUNDS_NOTICE,
  NV_CONTACT_EMAIL,
  PAYMENT_STATUS_LABEL,
  PLAN_FEATURE_LABEL,
  RECEIPT_ACCEPT,
  RECEIPT_MAX_BYTES,
  RECEIPT_TYPES,
  SALES_PLANS,
  formatPaymentAmount,
  paymentMethodDef,
  paymentMethodQr,
  planPayerFields,
  vesAmount,
  type AccessOverview,
  type AccessPlanOption,
  type PaymentCurrency,
  type PaymentMethod,
  type PlanFeature,
  type SalesPlanId,
} from "@nv/domain";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { usePayAccess } from "@/hooks/use-domain-mutations";
import { errorMessage } from "@/components/entities/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATUS_BADGE } from "@/lib/payments";

const day = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });

/** "18 h" / "45 min" left until `iso` (never negative). */
export function timeLeft(iso: string, now = Date.now()): string {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} días`;
  if (hours >= 1) return `${hours} h`;
  return `${Math.max(1, Math.ceil(ms / 60_000))} min`;
}

/** USDT is paid 1:1 for USD prices. */
const sameMoney = (c: string) => (c === "USDT" ? "USD" : c);

/** Older APIs only send the Pro price: show it as the single plan. */
function planOptions(access: AccessOverview): AccessPlanOption[] {
  return access.plans?.length ? access.plans : [{ id: "pro", ...access.plan }];
}

/** The plan the brand has paid for and still runs (not the trial). */
function paidPlan(access: AccessOverview): SalesPlanId | undefined {
  return access.state === "active" ? (access.planId ?? "pro") : undefined;
}

function NoRefunds({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-xs text-ink",
        className,
      )}
      data-testid="no-refunds"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-warning" />
      <span>
        <strong>Sin reembolsos.</strong> {NO_REFUNDS_NOTICE}
      </span>
    </p>
  );
}

/** Every plan side by side, with what it includes and a button to choose it. */
export function PlanCards({
  access,
  onChoose,
  canPay,
}: {
  access: AccessOverview;
  onChoose?: (id: SalesPlanId) => void;
  canPay: boolean;
}) {
  const current = paidPlan(access);
  const unlimited = access.state === "unlimited";
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="plan-cards">
      {planOptions(access).map((option) => {
        const plan = SALES_PLANS[option.id];
        const isCurrent = current === option.id;
        const featured = option.id === "pro";
        const action = isCurrent ? "Renovar" : current === "basico" && option.id === "pro" ? "Mejorar a Pro" : `Elegir ${plan.name}`;
        return (
          <div
            key={option.id}
            data-testid={`plan-card-${option.id}`}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-panel p-5",
              featured ? "border-brand/50 shadow-brand" : "border-line-soft",
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              {featured ? <Crown className="size-4 text-brand" /> : <Sparkles className="size-4 text-ink-muted" />}
              <h3 className="text-ink-bright text-base font-semibold">{plan.name}</h3>
              {isCurrent ? (
                <span className="ml-auto rounded-full bg-state-success/15 px-2 py-0.5 text-[11px] font-semibold text-state-success">
                  Tu plan
                </span>
              ) : featured ? (
                <span className="ml-auto rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                  Recomendado
                </span>
              ) : null}
            </div>
            <p className="text-xs text-ink-muted">{plan.tagline}</p>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-ink-bright font-display text-3xl font-semibold">
                {formatPaymentAmount(option.price, option.currency)}
              </span>
              <span className="text-xs text-ink-muted">/ {option.days} días</span>
            </p>
            <ul className="mt-4 flex-1 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-state-success" />
                  <span>{f}</span>
                </li>
              ))}
              {plan.excluded.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-ink-faint" data-testid="plan-excluded">
                  <X className="mt-0.5 size-4 shrink-0" />
                  <span className="line-through decoration-ink-faint/50">{f}</span>
                </li>
              ))}
            </ul>
            {onChoose && !unlimited ? (
              <Button
                className="mt-5 w-full"
                variant={featured ? "default" : "outline"}
                disabled={!canPay}
                onClick={() => onChoose(option.id)}
              >
                {action}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const copy = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => toast.success(`${label} copiado`))
      .catch(() => toast.error("No se pudo copiar"));
  };
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
        <div className="text-ink-bright break-all text-sm font-medium">{value}</div>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={copy} aria-label={`Copiar ${label}`} title="Copiar">
        <Copy className="size-4" />
      </Button>
    </div>
  );
}

/** The selected account, one field per row, each with a copy button. */
function MethodDetails({ method }: { method: PaymentMethod }) {
  const def = paymentMethodDef(method.kind);
  const rows = def.fields
    .filter((f) => f.type !== "image")
    .map((f) => ({ label: f.label, value: (method.details[f.key] ?? "").trim() }))
    .filter((r) => r.value);
  const qr = paymentMethodQr(method);
  return (
    <div className="rounded-xl border border-line-soft bg-panel-raised px-4 py-1" data-testid="plan-method-details">
      <div className="divide-y divide-line-soft">
        {rows.map((r) => (
          <CopyRow key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
      {qr ? (
        <div className="flex flex-col items-center gap-2 border-t border-line-soft py-3" data-testid="plan-method-qr">
          <img src={qr} alt={`Código QR de ${method.label}`} className="max-h-72 w-auto max-w-full rounded-lg bg-white object-contain" />
          <p className="text-xs text-ink-muted">Escanéalo desde la app de {method.label} para pagar.</p>
        </div>
      ) : null}
      {method.instructions?.trim() ? (
        <p className="border-t border-line-soft py-2 text-xs text-ink-muted">{method.instructions.trim()}</p>
      ) : null}
    </div>
  );
}

/** Today in the browser's time zone, as YYYY-MM-DD (for the date field). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** What to pay with this method: bolívares at today's USDT rate, or the plan price. */
function quoteFor(method: PaymentMethod | undefined, option: AccessPlanOption, access: AccessOverview) {
  const usd = sameMoney(option.currency) === "USD";
  if (method?.currency === "VES" && usd && access.vesRate) {
    const amount = vesAmount(option.price, access.vesRate.rate);
    return { amount: formatPaymentAmount(amount, "VES"), rate: access.vesRate, local: true as const };
  }
  return { amount: formatPaymentAmount(option.price, option.currency), rate: undefined, local: false as const };
}

/** The receipt picker: one photo, screenshot or PDF up to 5 MB, with a preview. */
function ReceiptInput({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return onChange(null);
    if (!(RECEIPT_TYPES as readonly string[]).includes(f.type)) {
      setError("Sube una imagen (JPG, PNG o WebP) o un PDF.");
      return onChange(null);
    }
    if (f.size > RECEIPT_MAX_BYTES) {
      setError("El archivo pesa más de 5 MB. Envía una captura más liviana.");
      return onChange(null);
    }
    onChange(f);
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor="plan-receipt">Comprobante del pago</Label>
      <label
        htmlFor="plan-receipt"
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors",
          file ? "border-brand/50 bg-brand/5" : "border-line-soft hover:border-brand/40",
        )}
      >
        {preview ? (
          <img src={preview} alt="" className="size-12 rounded-md object-cover" />
        ) : (
          <span className="grid size-12 place-items-center rounded-md bg-panel-raised text-ink-muted">
            {file ? <FileText className="size-5" /> : <Upload className="size-5" />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink-bright">{file ? file.name : "Adjunta la captura o el PDF del pago"}</span>
          <span className="text-xs text-ink-muted">Obligatorio · JPG, PNG, WebP o PDF · hasta 5 MB</span>
        </span>
        {file ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Quitar comprobante"
            onClick={(e) => {
              e.preventDefault();
              onChange(null);
            }}
          >
            <XCircle className="size-4" />
          </Button>
        ) : null}
      </label>
      <input
        id="plan-receipt"
        type="file"
        accept={RECEIPT_ACCEPT}
        className="sr-only"
        data-testid="plan-receipt"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error ? <p className="text-xs text-state-danger">{error}</p> : null}
    </div>
  );
}

/** Step 2: pay the chosen plan to one account, then send the payment details and the receipt. */
function PlanCheckout({
  slug,
  access,
  planId,
  onBack,
}: {
  slug: string;
  access: AccessOverview;
  planId: SalesPlanId;
  onBack?: () => void;
}) {
  const pay = usePayAccess(slug);
  const { methods } = access;
  const option = planOptions(access).find((p) => p.id === planId) ?? planOptions(access)[0]!;
  const price = formatPaymentAmount(option.price, option.currency);
  const [methodId, setMethodId] = React.useState(methods[0]?.id ?? "");
  const [reference, setReference] = React.useState("");
  const [payer, setPayer] = React.useState<Record<string, string>>({ paidOn: todayIso() });
  const [receipt, setReceipt] = React.useState<File | null>(null);
  const [accepted, setAccepted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const method = methods.find((m) => m.id === methodId);
  const fields = method ? planPayerFields(method.kind) : [];
  const quote = quoteFor(method, option, access);
  const otherMoney = method && !quote.local && sameMoney(method.currency) !== sameMoney(option.currency);

  React.useEffect(() => {
    if (!methodId && methods[0]) setMethodId(methods[0].id);
  }, [methods, methodId]);
  // The amount field starts with what this method should receive.
  React.useEffect(() => {
    setPayer((p) => ({ ...p, amountPaid: quote.amount }));
  }, [quote.amount]);

  const missing = fields.some((f) => f.required && !(payer[f.key] ?? "").trim());
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!receipt) return setError("Adjunta el comprobante del pago.");
    const clean = Object.fromEntries(
      fields.map((f) => [f.key, (payer[f.key] ?? "").trim()]).filter(([, v]) => v),
    );
    pay.mutate(
      { planId, methodId, reference: reference.trim(), payer: clean, receipt },
      { onError: (err) => setError(errorMessage(err)) },
    );
  };

  return (
    <form className="mx-auto w-full max-w-2xl space-y-5" onSubmit={submit} data-testid="plan-checkout">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3">
        {onBack ? (
          <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Cambiar de plan" title="Cambiar de plan">
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-muted">Vas a pagar</div>
          <div className="text-ink-bright font-semibold">
            Plan {SALES_PLANS[planId].name} · {option.days} días
          </div>
        </div>
        <div className="text-right">
          <div className="text-ink-bright font-display text-2xl font-semibold" data-testid="plan-amount">
            {quote.amount}
          </div>
          {quote.local ? <div className="text-xs text-ink-muted">equivale a {price}</div> : null}
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink-bright">1. Elige dónde pagar</h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Método de pago">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={m.id === methodId}
              onClick={() => setMethodId(m.id)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                m.id === methodId
                  ? "border-brand bg-brand/15 text-ink-bright"
                  : "border-line-soft bg-panel text-ink-muted hover:text-ink",
              )}
            >
              {m.label || paymentMethodDef(m.kind).label}
            </button>
          ))}
        </div>
        {method ? <MethodDetails method={method} /> : null}
        {quote.local && quote.rate ? (
          <p className="rounded-lg border border-line-soft bg-panel px-3 py-2 text-xs text-ink-muted" data-testid="plan-ves-rate">
            Paga exactamente <strong className="text-ink-bright">{quote.amount}</strong>. Tasa USDT del día: 1 USDT ={" "}
            {formatPaymentAmount(quote.rate.rate, "VES")} ({quote.rate.source === "binance" ? "Binance P2P" : "tasa fijada por NV"},{" "}
            {new Date(quote.rate.at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}).
          </p>
        ) : method?.currency === "VES" ? (
          <p className="text-xs text-ink-muted">
            No pudimos leer la tasa USDT de hoy: paga el equivalente de {price} en bolívares a la tasa USDT del día y escribe el monto abajo.
          </p>
        ) : otherMoney ? (
          <p className="text-xs text-ink-muted">
            Este método recibe {method!.currency}: paga el equivalente de {price} y escribe el monto abajo.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-bright">2. Cuéntanos cómo pagaste</h3>
        <div className="space-y-1.5">
          <Label htmlFor="plan-reference">Referencia o número de operación</Label>
          <Input
            id="plan-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Ej.: 004512 o el ID de la transacción"
            minLength={3}
            maxLength={120}
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`payer-${f.key}`}>
                {f.label}
                {f.required ? null : <span className="text-ink-faint"> (opcional)</span>}
              </Label>
              <Input
                id={`payer-${f.key}`}
                type={f.type === "date" ? "date" : f.type === "tel" ? "tel" : "text"}
                value={payer[f.key] ?? ""}
                onChange={(e) => setPayer((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                max={f.type === "date" ? todayIso() : undefined}
                maxLength={120}
                required={f.required}
              />
            </div>
          ))}
        </div>
        <ReceiptInput file={receipt} onChange={setReceipt} />
      </section>

      <NoRefunds />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[hsl(var(--brand-a))]"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          data-testid="plan-accept-no-refunds"
        />
        <span>Entiendo que el pago no es reembolsable.</span>
      </label>

      {error ? (
        <p className="rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-sm text-state-danger">{error}</p>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        disabled={pay.isPending || !methodId || reference.trim().length < 3 || missing || !receipt || !accepted}
      >
        {pay.isPending ? "Enviando…" : `Enviar pago de ${quote.amount} para verificar`}
      </Button>
      <p className="text-center text-xs text-ink-faint">
        Revisamos el comprobante y activamos tu plan en cuanto vemos el pago. Tus días se suman a los que te queden.
      </p>
    </form>
  );
}

/** Last plan payment: waiting, confirmed or rejected (with the reason). */
function LastPayment({ access }: { access: AccessOverview }) {
  const payment = access.payment;
  if (!payment) return null;
  const waiting = payment.status === "por_verificar";
  const rejected = payment.status === "rechazado";
  const Icon = waiting ? ShieldCheck : rejected ? XCircle : CheckCircle2;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-sm",
        waiting ? "border-brand/30 bg-brand/10" : rejected ? "border-state-danger/30 bg-state-danger/10" : "border-line-soft",
      )}
      data-testid="plan-payment"
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", rejected ? "text-state-danger" : "text-brand")} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink-bright">
            {waiting ? "Estamos verificando tu pago" : "Tu último pago"}
          </span>
          <Badge variant={STATUS_BADGE[payment.status]}>{PAYMENT_STATUS_LABEL[payment.status]}</Badge>
        </div>
        <p className="text-ink-muted">
          {payment.planId ? `Plan ${SALES_PLANS[payment.planId].name} · ` : ""}
          {payment.localAmount != null && payment.localCurrency
            ? `${formatPaymentAmount(payment.localAmount, payment.localCurrency as PaymentCurrency)} (${formatPaymentAmount(payment.amount, payment.currency)})`
            : formatPaymentAmount(payment.amount, payment.currency)}
          {payment.methodLabel ? ` · ${payment.methodLabel}` : ""}
          {payment.reference ? ` · ref ${payment.reference}` : ""}
        </p>
        {waiting ? <p className="text-ink-muted">Tu plan se activa solo en cuanto lo confirmemos; no tienes que hacer nada más.</p> : null}
        {rejected && payment.rejectReason ? <p className="text-state-danger">Motivo: {payment.rejectReason}</p> : null}
      </div>
    </div>
  );
}

/**
 * Choose a plan, then pay it. Nothing is charged here: the operator checks
 * their own account and the brand opens when they confirm it in Cobros.
 */
export function PlanPicker({ slug, access, canPay }: { slug: string; access: AccessOverview; canPay: boolean }) {
  const [chosen, setChosen] = React.useState<SalesPlanId | null>(null);
  const waiting = access.payment?.status === "por_verificar";

  if (waiting) return <LastPayment access={access} />;
  if (chosen && access.methods.length > 0) {
    return <PlanCheckout slug={slug} access={access} planId={chosen} onBack={() => setChosen(null)} />;
  }
  return (
    <div className="space-y-4">
      <LastPayment access={access} />
      <PlanCards access={access} canPay={canPay} onChoose={setChosen} />
      {chosen && access.methods.length === 0 ? (
        <p className="rounded-lg border border-line-soft p-3 text-sm text-ink-muted">
          Los métodos de pago aún no están configurados. Escríbenos a{" "}
          <a href={`mailto:${NV_CONTACT_EMAIL}`} className="text-brand hover:underline">
            {NV_CONTACT_EMAIL}
          </a>{" "}
          y te ayudamos a activar tu plan.
        </p>
      ) : null}
      {!canPay && access.state !== "unlimited" ? (
        <p className="text-sm text-ink-muted">Pide al dueño o a un administrador de la marca que elija y pague el plan.</p>
      ) : null}
      {access.state !== "unlimited" ? <NoRefunds /> : null}
    </div>
  );
}

/** Kept for callers that pay straight away (the Pro plan). */
export function PlanPayForm({ slug, access, canPay }: { slug: string; access: AccessOverview; canPay: boolean }) {
  return <PlanPicker slug={slug} access={access} canPay={canPay} />;
}

/** Full-page lock once the trial (or paid time) is over. */
export function PlanLock({ slug, access, canPay }: { slug: string; access: AccessOverview; canPay: boolean }) {
  const wasPaid = !!access.paidUntil;
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6" data-testid="plan-lock">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand/15 text-brand">
          <Lock className="size-5" />
        </span>
        <h1 className="text-ink-bright font-display text-2xl font-semibold">
          {wasPaid ? "Tu plan venció" : access.trialDenied ? "Ya usaste tu prueba gratis" : "Tu prueba gratis terminó"}
        </h1>
        <p className="max-w-xl text-sm text-ink-muted" data-testid="plan-lock-reason">
          {wasPaid
            ? `Tu acceso terminó el ${day(access.paidUntil!)}. `
            : access.trialDenied
              ? "Este dispositivo o esta cuenta ya tuvo su prueba gratis. "
              : access.trialSendUsed
                ? "Tu prueba incluía un envío de campaña y ya salió. "
                : "Gracias por probar NV Marketing. "}
          Para seguir, elige un plan, paga a una de nuestras cuentas y lo activamos en cuanto veamos el pago. Tus datos siguen guardados.
        </p>
      </div>
      <PlanPicker slug={slug} access={access} canPay={canPay} />
    </div>
  );
}

/** «Mi plan»: what the brand has, every plan's features, and how to upgrade. */
export function PlanOverview({ slug, access, canPay }: { slug: string; access: AccessOverview; canPay: boolean }) {
  const current = paidPlan(access);
  let status: string;
  if (access.state === "unlimited") status = "Esta marca no necesita plan: todo está incluido.";
  else if (access.state === "trial" && access.trialEndsAt)
    status = `Prueba gratis con todo lo de Pro: te quedan ${timeLeft(access.trialEndsAt)} y ${access.trialSendUsed ? "ya usaste tu envío de campaña" : "1 envío de campaña"}.`;
  else if (access.state === "active" && access.paidUntil)
    status = `Plan ${SALES_PLANS[current ?? "pro"].name} activo hasta el ${day(access.paidUntil)} (${timeLeft(access.paidUntil)}).`;
  else status = "Tu plan venció. Elige uno para seguir usando el panel.";
  return (
    <div className="space-y-5" data-testid="plan-overview">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line-soft bg-panel p-4">
        <span className="grid size-10 place-items-center rounded-xl bg-brand/15 text-brand">
          <Crown className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-muted">Tu plan</div>
          <div className="text-ink-bright font-semibold">
            {access.state === "trial" ? "Prueba gratis" : current ? SALES_PLANS[current].name : access.state === "unlimited" ? "Incluido" : "Sin plan"}
          </div>
          <p className="text-sm text-ink-muted">{status}</p>
        </div>
      </div>
      <PlanPicker slug={slug} access={access} canPay={canPay} />
    </div>
  );
}

/** Thin bar above every page while the brand is on its free trial. */
export function TrialBanner({ slug, access }: { slug: string; access: AccessOverview; canPay: boolean }) {
  const navigate = useNavigate();
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  if (access.state !== "trial" || !access.trialEndsAt) return null;
  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm print:hidden"
      data-testid="trial-banner"
    >
      <Sparkles className="text-brand size-4 shrink-0" />
      <span className="flex-1">
        Prueba gratis: te quedan <strong>{timeLeft(access.trialEndsAt)}</strong> y{" "}
        <strong>{access.trialSendUsed ? "ya usaste tu envío de campaña" : "1 envío de campaña"}</strong>. Al enviar tu campaña de prueba, la
        prueba termina y te pediremos elegir un plan.
      </span>
      <Button size="sm" onClick={() => navigate(`/w/${slug}/plan`)}>
        <Crown className="size-4" /> Ver planes
      </Button>
    </div>
  );
}

/** Shown instead of a Pro-only module on the Básico plan. */
export function PlanUpgrade({ slug, feature }: { slug: string; feature: PlanFeature }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center" data-testid="plan-upgrade">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand/15 text-brand">
        <Crown className="size-5" />
      </span>
      <h1 className="text-ink-bright font-display text-2xl font-semibold">{PLAN_FEATURE_LABEL[feature]} es del plan Pro</h1>
      <p className="text-sm text-ink-muted">
        Tu plan Básico no incluye Tienda, Cobros, Automatizaciones, Formularios ni Embudos. Mejora a Pro para usarlos; lo que ya
        tenías guardado sigue ahí.
      </p>
      <Button onClick={() => navigate(`/w/${slug}/plan`)}>
        <Crown className="size-4" /> Mejorar a Pro
      </Button>
    </div>
  );
}
