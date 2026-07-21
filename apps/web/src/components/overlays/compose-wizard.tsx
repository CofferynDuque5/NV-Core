"use client";

import { ArrowLeft, ArrowRight, Send, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { COMPOSE_STEPS, useComposeStore } from "@/stores/compose-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ComposeWizard() {
  const open = useUiStore((s) => s.composeOpen);
  const close = useUiStore((s) => s.closeCompose);
  const { step, next, prev, goTo, reset } = useComposeStore();

  function handleOpenChange(v: boolean) {
    if (!v) {
      close();
      reset();
    }
  }

  const isLast = step === COMPOSE_STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enviar mensaje masivo</DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <ol className="flex items-center gap-1">
          {COMPOSE_STEPS.map((s, i) => (
            <li key={s.id} className="flex flex-1 items-center gap-1">
              <button
                onClick={() => goTo(i)}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                  i < step && "bg-brand text-white",
                  i === step && "bg-brand/20 text-brand ring-1 ring-brand/50",
                  i > step && "bg-panel-raised text-ink-faint",
                )}
              >
                {i + 1}
              </button>
              <span
                className={cn(
                  "hidden truncate text-[11px] sm:block",
                  i === step ? "text-ink" : "text-ink-faint",
                )}
              >
                {s.label}
              </span>
              {i < COMPOSE_STEPS.length - 1 ? (
                <span className="h-px flex-1 bg-line" />
              ) : null}
            </li>
          ))}
        </ol>

        {/* Step body */}
        <div className="min-h-[220px] py-1">
          {step === 0 ? (
            <EmptyState
              icon={Users}
              title="¿A quién enviar?"
              description="Selecciona segmentos, grupos o contactos. Aún no hay audiencias disponibles — créalas en Segmentos o Contactos."
              compact
            />
          ) : null}

          {step === 1 ? (
            <div className="space-y-2">
              <Label htmlFor="compose-body">Contenido del mensaje</Label>
              <Textarea
                id="compose-body"
                rows={6}
                placeholder="Hola {nombre} 👋 …"
                className="min-h-[140px]"
              />
              <p className="text-xs text-ink-muted">
                Variables disponibles:{" "}
                <code className="rounded bg-panel-raised px-1 text-brand">{"{nombre}"}</code>{" "}
                <code className="rounded bg-panel-raised px-1 text-brand">{"{servicio}"}</code>{" "}
                <code className="rounded bg-panel-raised px-1 text-brand">{"{fecha}"}</code>
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <EmptyState
              title="Adjuntar contenido"
              description="Arrastra imágenes o videos desde la Biblioteca. Aún no hay archivos cargados."
              compact
            />
          ) : null}

          {step === 3 ? (
            <EmptyState
              title="¿Cuándo enviar?"
              description="Programa el envío o envíalo ahora. La programación se activará cuando conectes un canal."
              compact
            />
          ) : null}

          {step === 4 ? (
            <EmptyState
              icon={Send}
              title="Revisar y enviar"
              description="El envío estará disponible cuando conectes un proveedor de mensajería (WhatsApp, Email…)."
              compact
            />
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={prev} disabled={step === 0}>
            <ArrowLeft className="size-4" /> Atrás
          </Button>
          {isLast ? (
            <Button size="sm" disabled title="Requiere un canal conectado">
              <Send className="size-4" /> Enviar
            </Button>
          ) : (
            <Button size="sm" onClick={next}>
              Continuar <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
