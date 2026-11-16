import { Check, Loader2, X } from "lucide-react";
import type { NotificationAction } from "@nv/domain";

import { useDecideSend } from "@/hooks/use-domain-mutations";
import { Button } from "@/components/ui/button";

/**
 * «Confirmar envío» / «No enviar» for a scheduled campaign send, or what was
 * answered. Used in the notifications panel and on the campaign card.
 */
export function SendConfirmButtons({ action }: { action: NotificationAction }) {
  const decide = useDecideSend();
  if (action.state !== "pending") {
    return (
      <p className={action.state === "confirmed" ? "text-state-success text-xs" : "text-ink-muted text-xs"} data-testid="send-confirm-answer">
        {action.state === "confirmed" ? "Envío confirmado" : "No se enviará"}
        {action.by ? ` por ${action.by}` : ""}
      </p>
    );
  }
  const go = (decision: "confirm" | "skip") =>
    decide.mutate({ campaignId: action.campaignId, slot: action.slot, decision });
  return (
    <div className="flex flex-wrap gap-2" data-testid="send-confirm">
      <Button size="sm" onClick={() => go("confirm")} disabled={decide.isPending}>
        {decide.isPending && decide.variables?.decision === "confirm" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Check className="size-4" />
        )}
        Confirmar envío
      </Button>
      <Button size="sm" variant="secondary" onClick={() => go("skip")} disabled={decide.isPending}>
        <X className="size-4" /> No enviar
      </Button>
    </div>
  );
}
