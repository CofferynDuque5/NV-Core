import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABEL,
  formatPaymentAmount,
  paymentMethodLine,
  type PaymentMethod,
  type PaymentStatus,
} from "@nv/domain";
import {
  BadgeDollarSign,
  CheckCheck,
  Clock,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { usePaymentMethods, usePayments, useVesRate } from "@/hooks/use-domain-data";
import {
  useDeletePaymentMethod,
  useTogglePaymentMethod,
  useUpdatePayment,
} from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { KpiCard } from "@/components/common/kpi-card";
import { ListSkeleton } from "@/components/common/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { PaymentMethodDialog } from "@/components/payments/payment-method-dialog";
import { PaymentSheet } from "@/components/payments/payment-sheet";
import { cn } from "@/lib/utils";
import {
  STATUS_BADGE,
  collectedThisMonth,
  isOverdue,
  methodsByCountry,
  statusCounts,
} from "@/lib/payments";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });

export default function CobrosPage() {
  const payments = usePayments();
  const methods = usePaymentMethods();
  const [tab, setTab] = React.useState("cobros");
  const [filter, setFilter] = React.useState<PaymentStatus | "todos">("todos");
  const [creating, setCreating] = React.useState(false);
  // `?cobro=<id>` (from the contact drawer) opens that payment directly.
  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = React.useState<string | null>(() => searchParams.get("cobro"));
  const [methodOpen, setMethodOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PaymentMethod | null>(null);
  // Several «Por verificar» payments confirmed at once (after checking the bank).
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [confirming, setConfirming] = React.useState(false);
  const updatePayment = useUpdatePayment();
  const confirmDialog = useConfirm();

  const list = payments.data ?? [];
  const counts = statusCounts(list);
  const collected = collectedThisMonth(list);
  const shown = filter === "todos" ? list : list.filter((p) => p.status === filter);
  const toVerify = shown.filter((p) => p.status === "por_verificar");
  const pickedRows = list.filter((p) => picked.has(p.id) && p.status === "por_verificar");

  async function confirmPicked() {
    if (pickedRows.length === 0) return;
    const lines = pickedRows.map(
      (p) =>
        `• ${p.concept}: ${formatPaymentAmount(p.amount, p.currency)}${p.reference ? ` (ref ${p.reference})` : ""}`,
    );
    const ok = await confirmDialog({
      title: `Confirmar ${pickedRows.length} ${pickedRows.length === 1 ? "pago" : "pagos"}`,
      description: `¿Ya viste cada uno en tu banco o billetera? La captura sola no basta.\n${lines.join("\n")}`,
      confirmLabel: "Sí, los recibí",
    });
    if (!ok) return;
    setConfirming(true);
    let done = 0;
    const failed: string[] = [];
    for (const p of pickedRows) {
      try {
        await updatePayment.mutateAsync({ id: p.id, input: { status: "pagado" } });
        done++;
      } catch (err) {
        failed.push(`${p.concept}: ${(err as Error).message}`);
      }
    }
    setConfirming(false);
    setPicked(new Set());
    if (failed.length) toast.error(`${done} confirmados. No se pudo: ${failed.join(" · ")}`);
    else toast.success(`${done} ${done === 1 ? "pago confirmado" : "pagos confirmados"}`);
  }
  const open = list.find((p) => p.id === openId) ?? null;
  const allMethods = methods.data ?? [];
  // Today's rate, only when the brand charges in bolívares.
  const usesVes =
    allMethods.some((m) => m.currency === "VES") || list.some((p) => p.currency === "VES");
  const vesRate = useVesRate(usesVes);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ventas"
        title="Cobros"
        description="Cobra en Colombia, Venezuela y Perú, con Binance o Zinli. Tu cliente paga a tus cuentas y tu equipo confirma el pago al verlo; la app no mueve dinero."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditing(null);
                setMethodOpen(true);
              }}
            >
              <Wallet className="size-4" /> Añadir método
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Nuevo cobro
            </Button>
          </div>
        }
      />

      {usesVes && vesRate.data ? (
        <p data-testid="ves-rate" className="text-ink-muted -mt-3 text-xs">
          Tasa del día:{" "}
          <b className="text-ink">
            1 USDT = Bs {vesRate.data.rate.toLocaleString("es-VE", { maximumFractionDigits: 2 })}
          </b>{" "}
          ({vesRate.data.source === "binance" ? "mediana de Binance P2P" : "tasa que fijaste"},{" "}
          {new Date(vesRate.data.at).toLocaleTimeString("es", {
            hour: "numeric",
            minute: "2-digit",
          })}
          )
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Por verificar"
          value={String(counts.por_verificar)}
          icon={ShieldCheck}
          accent="#E3B341"
          footnote="El cliente dice que pagó: revisa tu cuenta"
        />
        <KpiCard
          label="Pendientes"
          value={String(counts.pendiente + counts.rechazado)}
          icon={Clock}
          accent="#8C7BEF"
          footnote={`${list.filter((p) => isOverdue(p)).length} vencidos`}
        />
        <KpiCard
          label="Cobrado este mes"
          value={
            collected.length === 0
              ? "—"
              : collected.map((c) => formatPaymentAmount(c.amount, c.currency)).join(" · ")
          }
          icon={BadgeDollarSign}
          accent="#3FB950"
          footnote="Solo pagos confirmados; cada moneda por separado"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cobros">Cobros</TabsTrigger>
          <TabsTrigger value="metodos">Métodos de cobro ({allMethods.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="cobros" className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
            {(["todos", ...PAYMENT_STATUSES] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  filter === s
                    ? "border-brand/50 bg-brand/15 text-ink-bright"
                    : "border-line-soft text-ink-muted hover:text-ink",
                )}
              >
                {s === "todos"
                  ? `Todos (${list.length})`
                  : `${PAYMENT_STATUS_LABEL[s]} (${counts[s]})`}
              </button>
            ))}
          </div>
          {toVerify.length > 0 ? (
            <div
              className="border-line-soft bg-panel-raised flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
              data-testid="bulk-verify"
            >
              <label className="text-ink-muted inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[#5F86F2]"
                  aria-label="Seleccionar todos los por verificar"
                  checked={toVerify.every((p) => picked.has(p.id))}
                  onChange={(e) =>
                    setPicked(e.target.checked ? new Set(toVerify.map((p) => p.id)) : new Set())
                  }
                />
                {pickedRows.length > 0
                  ? `${pickedRows.length} seleccionados`
                  : `Marca los ${toVerify.length} por verificar que ya viste en tu cuenta`}
              </label>
              <Button
                size="sm"
                className="ml-auto"
                disabled={pickedRows.length === 0 || confirming}
                onClick={() => void confirmPicked()}
                data-testid="bulk-verify-confirm"
              >
                {confirming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCheck className="size-4" />
                )}
                Confirmar pagados
              </Button>
            </div>
          ) : null}
          {payments.isLoading ? (
            <ListSkeleton rows={4} />
          ) : shown.length === 0 ? (
            <Panel>
              <EmptyState
                icon={BadgeDollarSign}
                title={list.length === 0 ? "Aún no hay cobros" : "Nada con ese estado"}
                description={
                  list.length === 0
                    ? allMethods.length === 0
                      ? "Primero añade dónde te pagan (Nequi, Pago Móvil, Yape, Binance, Zinli…) y luego crea tu primer cobro."
                      : "Crea un cobro y te damos el mensaje con tus datos de pago para enviárselo al cliente."
                    : undefined
                }
                action={
                  list.length === 0 ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        allMethods.length === 0 ? setMethodOpen(true) : setCreating(true)
                      }
                    >
                      <Plus className="size-4" />{" "}
                      {allMethods.length === 0 ? "Añadir método" : "Nuevo cobro"}
                    </Button>
                  ) : undefined
                }
              />
            </Panel>
          ) : (
            <Panel className="divide-line-soft divide-y" data-testid="payments-list">
              {shown.map((p) => (
                <div key={p.id} className="hover:bg-panel-raised flex items-center">
                  {p.status === "por_verificar" ? (
                    <input
                      type="checkbox"
                      className="ml-4 size-4 shrink-0 accent-[#5F86F2]"
                      aria-label={`Seleccionar ${p.concept}`}
                      data-testid="payment-pick"
                      checked={picked.has(p.id)}
                      onChange={() =>
                        setPicked((cur) => {
                          const next = new Set(cur);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        })
                      }
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
                    data-testid="payment-row"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-ink-bright truncate text-sm font-medium">{p.concept}</p>
                      <p className="text-ink-muted truncate text-xs">
                        {p.contactName ?? "Sin contacto"} · {day(p.createdAt)}
                        {p.methodLabel ? ` · ${p.methodLabel}` : ""}
                        {isOverdue(p) ? (
                          <span className="text-state-danger"> · vencido</span>
                        ) : null}
                      </p>
                    </div>
                    <span className="text-ink-bright text-sm font-semibold tabular-nums">
                      {formatPaymentAmount(p.amount, p.currency)}
                    </span>
                    <Badge variant={STATUS_BADGE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
                  </button>
                </div>
              ))}
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="metodos" className="space-y-4">
          {methods.isLoading ? (
            <ListSkeleton rows={3} />
          ) : allMethods.length === 0 ? (
            <Panel>
              <EmptyState
                icon={Wallet}
                title="Sin métodos de cobro"
                description="Añade tus cuentas: Nequi, Daviplata o banco en Colombia; Pago Móvil o banco en Venezuela; Yape, Plin o banco en Perú; Binance Pay, USDT o Zinli."
                action={
                  <Button size="sm" onClick={() => setMethodOpen(true)}>
                    <Plus className="size-4" /> Añadir método
                  </Button>
                }
              />
            </Panel>
          ) : (
            methodsByCountry(allMethods).map((g) => (
              <section key={g.country} className="space-y-2">
                <h2 className="text-ink-faint text-xs font-semibold uppercase tracking-wider">
                  {g.label}
                </h2>
                <div
                  className="grid grid-cols-1 gap-3 md:grid-cols-2"
                  data-testid={`methods-${g.country}`}
                >
                  {g.methods.map((m) => (
                    <MethodCard
                      key={m.id}
                      method={m}
                      onEdit={() => {
                        setEditing(m);
                        setMethodOpen(true);
                      }}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </TabsContent>
      </Tabs>

      <PaymentDialog open={creating} onOpenChange={setCreating} onCreated={setOpenId} />
      <PaymentMethodDialog open={methodOpen} onOpenChange={setMethodOpen} method={editing} />
      <PaymentSheet
        payment={open}
        methods={allMethods}
        onClose={() => {
          setOpenId(null);
          if (searchParams.has("cobro")) setSearchParams({}, { replace: true });
        }}
      />
    </div>
  );
}

function MethodCard({ method, onEdit }: { method: PaymentMethod; onEdit: () => void }) {
  const toggle = useTogglePaymentMethod();
  const remove = useDeletePaymentMethod();
  const confirm = useConfirm();
  return (
    <Panel
      className={cn("space-y-2 p-4", !method.active && "opacity-60")}
      data-testid="method-card"
    >
      <div className="flex items-center gap-2">
        <span className="text-ink-bright text-sm font-semibold">{method.label}</span>
        <Badge variant="outline">{method.currency}</Badge>
        {!method.active ? <Badge variant="neutral">Pausado</Badge> : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => toggle.mutate({ id: method.id, active: !method.active })}
          >
            {method.active ? "Pausar" : "Activar"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            aria-label={`Editar ${method.label}`}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            aria-label={`Eliminar ${method.label}`}
            onClick={async () => {
              const ok = await confirm({
                title: "Eliminar método",
                description: `¿Eliminar «${method.label}»? Los cobros ya pagados con él conservan su nombre.`,
                confirmLabel: "Eliminar",
                destructive: true,
              });
              if (ok) remove.mutate(method.id);
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <p className="text-ink-muted break-words text-xs">
        {paymentMethodLine(method).split(" · ").slice(1).join(" · ") || "Sin datos"}
      </p>
    </Panel>
  );
}
