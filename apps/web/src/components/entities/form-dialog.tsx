
import * as React from "react";
import { Loader2 } from "lucide-react";

import { isBackendConfigured } from "@/lib/env";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Presentational wrapper for create/edit forms: handles submit state, error
 * display and demo-mode gating. The caller owns field state and the mutation.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  pending,
  error,
  submitLabel = "Guardar",
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  onSubmit: () => void;
  pending: boolean;
  error?: string | null;
  submitLabel?: string;
  children: React.ReactNode;
}) {
  const backend = isBackendConfigured();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          {!backend ? (
            <div className="rounded-lg border border-state-warning/30 bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
              Modo demo: conecta el backend (<code>VITE_API_URL</code>) para guardar.
            </div>
          ) : null}

          <div className="space-y-4">{children}</div>

          {error ? (
            <p className="rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-xs text-state-danger">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !backend}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Small helper to turn an unknown error into a message. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Ocurrió un error.";
}
