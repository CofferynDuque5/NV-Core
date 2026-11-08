import * as React from "react";

import { useSendSettings } from "@/hooks/use-domain-data";
import { useSaveSendSettings } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SendConfirmMode } from "@nv/domain";

/**
 * The brand's sending hours (campaigns only reach groups inside them; the
 * rest wait for their hour) and the default most messages a group gets a day.
 */
export function SendHoursDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const settings = useSendSettings();
  const save = useSaveSendSettings();
  const [from, setFrom] = React.useState("");
  const [until, setUntil] = React.useState("");
  const [max, setMax] = React.useState("");
  const [confirm, setConfirm] = React.useState<SendConfirmMode>("notify");
  const [lead, setLead] = React.useState("15");
  const [browserNotice, setBrowserNotice] = React.useState<string>(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !settings.data) return;
    setFrom(settings.data.sendFrom ?? "");
    setUntil(settings.data.sendUntil ?? "");
    setMax(settings.data.groupMaxPerDay ? String(settings.data.groupMaxPerDay) : "");
    setConfirm(settings.data.sendConfirm ?? "notify");
    setLead(String(settings.data.sendConfirmLeadMin ?? 15));
    setError(null);
  }, [open, settings.data]);

  const submit = () => {
    setError(null);
    if (Boolean(from) !== Boolean(until)) {
      setError("Indica las dos horas (desde y hasta) o deja ambas vacías.");
      return;
    }
    const n = max.trim() ? Number(max) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 50)) {
      setError("El máximo por día va de 1 a 50 (o vacío para no limitar).");
      return;
    }
    const leadMin = Number(lead);
    if (confirm !== "off" && (!Number.isInteger(leadMin) || leadMin < 5 || leadMin > 120)) {
      setError("El aviso llega entre 5 y 120 minutos antes del envío.");
      return;
    }
    save.mutate(
      {
        sendFrom: from || null,
        sendUntil: until || null,
        groupMaxPerDay: n,
        sendConfirm: confirm,
        ...(confirm !== "off" ? { sendConfirmLeadMin: leadMin } : {}),
      },
      { onSuccess: () => onOpenChange(false), onError: (err) => setError(errorMessage(err)) },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Horario y avisos de envío"
      description="Tus campañas solo llegan a los grupos dentro de este horario. Si una campaña sale fuera de hora, esos grupos la reciben cuando se abre su horario."
      onSubmit={submit}
      pending={save.isPending}
      error={error}
      submitLabel="Guardar"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sh-from">Desde</Label>
          <Input id="sh-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sh-until">Hasta</Label>
          <Input id="sh-until" type="time" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-ink-muted">
        Hora de tu marca. Puede cruzar la medianoche (por ejemplo 20:00 a 02:00). Vacío = a cualquier hora.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="sh-max">Máximo de mensajes de campaña por grupo al día</Label>
        <Input id="sh-max" type="number" min={1} max={50} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Sin límite" />
        <p className="text-xs text-ink-muted">
          Cuando un grupo llega al máximo, las demás campañas de ese día lo saltan y te lo dicen en el aviso. Cada grupo
          puede tener su propio horario y máximo en «Reglas».
        </p>
      </div>
      <div className="space-y-1.5 border-t border-line-soft pt-3">
        <Label htmlFor="sh-confirm">Aviso antes de enviar una campaña programada</Label>
        <select
          id="sh-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value as SendConfirmMode)}
          className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
        >
          <option value="notify">Avisarme y enviar si no respondo</option>
          <option value="require">Avisarme y enviar solo si confirmo</option>
          <option value="off">No avisar</option>
        </select>
        {confirm !== "off" ? (
          <div className="flex items-center gap-2 pt-1">
            <Input
              id="sh-lead"
              aria-label="Minutos antes"
              type="number"
              min={5}
              max={120}
              inputMode="numeric"
              value={lead}
              onChange={(e) => setLead(e.target.value)}
              className="w-24"
            />
            <span className="text-sm text-ink-muted">minutos antes</span>
          </div>
        ) : null}
        {confirm !== "off" && browserNotice === "default" ? (
          <button
            type="button"
            className="text-xs font-medium text-brand underline-offset-2 hover:underline"
            onClick={() => {
              try {
                void Notification.requestPermission().then((p) => setBrowserNotice(p));
              } catch {
                setBrowserNotice("denied");
              }
            }}
          >
            Avisarme también con una notificación del navegador
          </button>
        ) : null}
        <p className="text-xs text-ink-muted">
          Te llega a la campanita del panel con «Confirmar envío» y «No enviar». «No enviar» salta solo ese envío; una
          campaña diaria vuelve a salir el día siguiente.
        </p>
      </div>
    </FormDialog>
  );
}
