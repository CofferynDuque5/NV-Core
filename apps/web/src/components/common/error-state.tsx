import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Algo salió mal",
  description = "No se pudo cargar la información. Inténtalo de nuevo.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-state-danger/40 bg-state-danger/5 px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-state-danger/10 text-state-danger">
        <AlertTriangle className="size-5" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink-bright">{title}</h3>
        <p className="mx-auto max-w-sm text-xs text-ink-muted">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
