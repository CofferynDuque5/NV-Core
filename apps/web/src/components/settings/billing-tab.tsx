
import { CreditCard, ExternalLink, Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { usageRows } from "@/lib/plan";
import { useBilling } from "@/hooks/use-domain-data";
import { useBillingPortal, useCheckout } from "@/hooks/use-domain-mutations";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  trialing: "Prueba",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  incomplete: "Incompleta",
  unpaid: "Impaga",
};

export function BillingTab() {
  const billing = useBilling();
  const checkout = useCheckout();
  const portal = useBillingPortal();

  if (billing.isLoading) {
    return (
      <Panel>
        <PanelHeader title="Facturación" />
        <div className="p-4">
          <ListSkeleton rows={3} />
        </div>
      </Panel>
    );
  }

  const data = billing.data;

  if (!data) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No se pudo cargar la facturación"
        description="Vuelve a intentarlo en unos segundos."
      />
    );
  }

  const status = data.subscriptionStatus;
  const hasSubscription = Boolean(status && status !== "canceled");
  const rows = usageRows(data.limits, data.usage);
  const isFree = data.planId === "free";

  return (
    <div className="space-y-4">
      {/* Plan & usage summary */}
      <Panel>
        <PanelHeader
          title="Plan y uso"
          description="Consumo del workspace frente a los límites de tu plan."
          action={
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                isFree ? "bg-panel text-ink-muted" : "bg-brand/10 text-brand",
              )}
            >
              Plan {data.planName}
            </span>
          }
        />
        <div className="space-y-3 p-4">
          {rows.map((r) => (
            <div key={r.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-soft">{r.label}</span>
                <span className={cn("tabular-nums", r.exhausted ? "text-state-warning" : "text-ink-muted")}>
                  {r.used}
                  {r.limit != null ? ` / ${r.limit}` : " · ilimitado"}
                </span>
              </div>
              {r.limit != null ? (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-high">
                  <div
                    className={cn("h-full rounded-full", r.exhausted ? "bg-state-warning" : r.nearLimit ? "bg-brand-violet" : "bg-brand")}
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
              ) : null}
            </div>
          ))}

          {isFree ? (
            <div className="mt-1 flex flex-col gap-3 rounded-lg border border-line-soft bg-panel-raised p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-ink-bright">Amplía a Pro</div>
                  <p className="text-xs text-ink-muted">
                    Contactos, campañas, miembros y llamadas de IA sin límite.
                  </p>
                </div>
              </div>
              {data.configured ? (
                <Button
                  size="sm"
                  className="shrink-0 self-start sm:self-center"
                  onClick={() => checkout.mutate(undefined)}
                  disabled={checkout.isPending}
                >
                  {checkout.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Amplía a Pro
                </Button>
              ) : (
                <span className="shrink-0 text-[11px] text-ink-faint">
                  Configura Stripe para habilitar la mejora.
                </span>
              )}
            </div>
          ) : null}
        </div>
      </Panel>

      {!data.configured ? (
        <EmptyState
          icon={CreditCard}
          title="Facturación no configurada"
          description="Define STRIPE_SECRET_KEY (y STRIPE_PRICE_ID) en el backend para habilitar suscripciones con Stripe."
        />
      ) : (
    <Panel>
      <PanelHeader
        title="Facturación"
        description="Gestiona la suscripción de tu workspace con Stripe."
      />
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between rounded-lg border border-line-soft bg-panel-raised p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-brand/10 text-brand">
              <CreditCard className="size-5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink-bright">
                {hasSubscription ? "Suscripción" : "Sin suscripción activa"}
              </div>
              <div className="text-xs text-ink-muted">
                {status
                  ? `Estado: ${STATUS_LABELS[status] ?? status}`
                  : "Aún no has iniciado una suscripción."}
              </div>
            </div>
          </div>
          <span
            className={
              hasSubscription
                ? "rounded-full bg-state-success/10 px-2.5 py-1 text-[11px] font-medium text-state-success"
                : "rounded-full bg-panel px-2.5 py-1 text-[11px] font-medium text-ink-faint"
            }
          >
            {hasSubscription ? "Activa" : "Inactiva"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {hasSubscription || data.customer ? (
            <Button variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending}>
              {portal.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ExternalLink className="size-4" />
              )}
              Gestionar en Stripe
            </Button>
          ) : null}
          {!hasSubscription ? (
            <Button onClick={() => checkout.mutate(undefined)} disabled={checkout.isPending}>
              {checkout.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CreditCard className="size-4" />
              )}
              Suscribirse
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-ink-faint">
          Los pagos se procesan de forma segura en Stripe. Serás redirigido a su
          checkout / portal de cliente.
        </p>
      </div>
    </Panel>
      )}
    </div>
  );
}
