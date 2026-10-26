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
import { BadgeDollarSign, Clock, Pencil, Plus, ShieldCheck, Trash2, Wallet } from "lucide-react";

import { usePaymentMethods, usePayments } from "@/hooks/use-domain-data";
import { useDeletePaymentMethod, useTogglePaymentMethod } from "@/hooks/use-domain-mutations";
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
import { STATUS_BADGE, collectedThisMonth, isOverdue, methodsByCountry, statusCounts } from "@/lib/payments";

const day = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });

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

  const list = payments.data ?? [];
  const counts = statusCounts(list);
  const collected = collectedThisMonth(list);
  const shown = filter === "todos" ? list : list.filter((p) => p.status === filter);
  const open = list.find((p) => p.id === openId) ?? null;
  const allMethods = methods.data ?? [];

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

      <div className="grid gap-3 sm:grid-cols-3">
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
          value={collected.length === 0 ? "—" : collected.map((c) => formatPaymentAmount(c.amount, c.currency)).join(" · ")}
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
                  filter === s ? "border-brand/50 bg-brand/15 text-ink-bright" : "border-line-soft text-ink-muted hover:text-ink",
                )}
              >
                {s === "todos" ? `Todos (${list.length})` : `${PAYMENT_STATUS_LABEL[s]} (${counts[s]})`}
              </button>
            ))}
          </div>
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
                    <Button size="sm" onClick={() => (allMethods.length === 0 ? setMethodOpen(true) : setCreating(true))}>
                      <Plus className="size-4" /> {allMethods.length === 0 ? "Añadir método" : "Nuevo cobro"}
                    </Button>
                  ) : undefined
                }
              />
            </Panel>
          ) : (
            <Panel className="divide-y divide-line-soft" data-testid="payments-list">
              {shown.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOpenId(p.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-panel-raised"
                  data-testid="payment-row"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-bright">{p.concept}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {p.contactName ?? "Sin contacto"} · {day(p.createdAt)}
                      {p.methodLabel ? ` · ${p.methodLabel}` : ""}
                      {isOverdue(p) ? <span className="text-state-danger"> · vencido</span> : null}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-ink-bright">
                    {formatPaymentAmount(p.amount, p.currency)}
                  </span>
                  <Badge variant={STATUS_BADGE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
                </button>
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
                <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{g.label}</h2>
                <div className="grid gap-3 md:grid-cols-2" data-testid={`methods-${g.country}`}>
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
      <PaymentSheet payment={open} methods={allMethods} onClose={() => {
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
    <Panel className={cn("space-y-2 p-4", !method.active && "opacity-60")} data-testid="method-card">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink-bright">{method.label}</span>
        <Badge variant="outline">{method.currency}</Badge>
        {!method.active ? <Badge variant="neutral">Pausado</Badge> : null}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggle.mutate({ id: method.id, active: !method.active })}>
            {method.active ? "Pausar" : "Activar"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`Editar ${method.label}`} onClick={onEdit}>
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
      <p className="break-words text-xs text-ink-muted">{paymentMethodLine(method).split(" · ").slice(1).join(" · ") || "Sin datos"}</p>
    </Panel>
  );
}
