import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Loader2, X } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  SALES_PLANS,
  formatPaymentAmount,
  type PaymentCurrency,
  type PlanPaymentReview,
} from "@nv/domain";
import { toast } from "sonner";

import { useServices } from "@/hooks/use-services";
import { errorMessage } from "@/components/entities/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_BADGE } from "@/lib/payments";

/** Labels of the payer fields, whatever the method was. */
const PAYER_LABEL: Record<string, string> = {
  payerName: "Pagó",
  payerBank: "Banco",
  payerPhone: "Teléfono",
  payerDoc: "Documento",
  payerAccount: "Cuenta",
  paidOn: "Fecha",
  amountPaid: "Monto declarado",
};

function money(amount: number, currency: string) {
  return formatPaymentAmount(amount, currency as PaymentCurrency);
}

function Row({ p }: { p: PlanPaymentReview }) {
  const svc = useServices();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "plan-payments"] });
    void qc.invalidateQueries({ queryKey: ["admin", "access"] });
  };
  const approve = useMutation({
    mutationFn: () => svc.admin.approvePlanPayment(p.id),
    onSuccess: () => {
      toast.success(`Pago aprobado: ${p.forWorkspace} queda activa.`);
      done();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: () => svc.admin.rejectPlanPayment(p.id, reason.trim()),
    onSuccess: () => {
      toast.success("Pago rechazado. El cliente verá el motivo.");
      setRejecting(false);
      done();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const openReceipt = async () => {
    // A new tab opened right away (popup blockers), then pointed at the file.
    const tab = window.open("", "_blank");
    try {
      const blob = await svc.admin.planPaymentReceipt(p.id);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tab?.close();
      toast.error(errorMessage(e));
    }
  };
  const waiting = p.status === "por_verificar";
  return (
    <li
      className="border-line-soft space-y-2 rounded-xl border p-3"
      data-testid="plan-payment-review"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-bright font-medium">{p.forWorkspace}</span>
        <Badge variant={STATUS_BADGE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
        <span className="text-ink-muted text-xs">
          Plan {SALES_PLANS[p.planId ?? "pro"].name} · {new Date(p.createdAt).toLocaleString("es")}
        </span>
      </div>
      <p className="text-sm">
        <strong>
          {p.localAmount != null && p.localCurrency
            ? money(p.localAmount, p.localCurrency)
            : money(p.amount, p.currency)}
        </strong>
        {p.localAmount != null
          ? ` (${money(p.amount, p.currency)}${p.rate ? ` · tasa ${p.rate} Bs/USDT` : ""})`
          : ""}
        {p.methodLabel ? ` · ${p.methodLabel}` : ""}
        {p.reference ? ` · ref ${p.reference}` : ""}
      </p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {Object.entries(p.payer).map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <dt className="text-ink-faint">{PAYER_LABEL[k] ?? k}:</dt>
            <dd className="text-ink break-all">{v}</dd>
          </div>
        ))}
        <div className="flex gap-1.5">
          <dt className="text-ink-faint">Enviado por:</dt>
          <dd className="text-ink break-all">{p.createdBy}</dd>
        </div>
      </dl>
      {p.rejectReason ? (
        <p className="text-state-danger text-xs">Motivo: {p.rejectReason}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {p.hasReceipt ? (
          <Button size="sm" variant="secondary" onClick={() => void openReceipt()}>
            <FileText className="size-4" /> Ver comprobante
          </Button>
        ) : null}
        {waiting ? (
          <>
            <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
              {approve.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}{" "}
              Aprobar y activar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting((v) => !v)}>
              <X className="size-4" /> Rechazar
            </Button>
          </>
        ) : null}
      </div>
      {rejecting ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            reject.mutate();
          }}
        >
          <Input
            className="min-w-0 flex-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (lo verá el cliente): p. ej. no llegó el pago"
            maxLength={300}
            aria-label="Motivo del rechazo"
          />
          <Button
            size="sm"
            variant="destructive"
            type="submit"
            disabled={reason.trim().length < 3 || reject.isPending}
          >
            Confirmar rechazo
          </Button>
        </form>
      ) : null}
    </li>
  );
}

/** Plan payments customers sent: receipt, payer details, approve or reject. */
export function PlanPaymentsSection({ enabled }: { enabled: boolean }) {
  const svc = useServices();
  const list = useQuery({
    queryKey: ["admin", "plan-payments"],
    queryFn: () => svc.admin.planPayments(),
    enabled,
    refetchInterval: 60_000,
  });
  const rate = useQuery({
    queryKey: ["admin", "usdt-rate"],
    queryFn: () => svc.admin.usdtRate(),
    enabled,
  });
  const rows = list.data ?? [];
  const waiting = rows.filter((r) => r.status === "por_verificar").length;
  const r = rate.data?.rate;
  return (
    <section className="nv-panel space-y-3 p-4" data-testid="admin-plan-payments">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-ink-bright flex-1 font-semibold">
          Pagos de planes{" "}
          {waiting > 0 ? <span className="text-brand">· {waiting} por aprobar</span> : null}
        </h2>
        <span className="text-ink-muted text-xs">
          {r
            ? `Tasa USDT: ${r.rate} Bs (${r.source === "binance" ? "Binance P2P" : "fijada"}, ${new Date(r.at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })})`
            : "Tasa USDT no disponible"}
        </span>
      </div>
      {list.isLoading ? (
        <p className="text-ink-muted text-sm">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-muted text-sm">Aún no llegan pagos de planes.</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 30).map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
