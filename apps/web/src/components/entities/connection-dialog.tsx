"use client";

import * as React from "react";
import { CHANNELS, CONNECTION_STATUSES, type ChannelId, type ConnectionStatus } from "@nv/domain";

import { useUpsertConnection } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  ok: "Conectado",
  warn: "Con advertencias",
  down: "Caído",
};

export function ConnectionDialog({
  channel,
  open,
  onOpenChange,
}: {
  channel: ChannelId | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mutation = useUpsertConnection();
  const [handle, setHandle] = React.useState("");
  const [status, setStatus] = React.useState<ConnectionStatus>("ok");
  const [token, setToken] = React.useState("");
  const [webhookStatus, setWebhookStatus] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setHandle("");
    setStatus("ok");
    setToken("");
    setWebhookStatus("");
    setError(null);
  }

  function submit() {
    if (!channel) return;
    setError(null);
    mutation.mutate(
      {
        channel,
        handle: handle.trim(),
        status,
        token: token.trim() || undefined,
        webhookStatus: webhookStatus.trim() || undefined,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  const channelName = channel ? CHANNELS[channel].name : "";

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title={`Conectar ${channelName}`}
      description="Registra las credenciales del canal. El OAuth real llegará en la fase de proveedores."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Guardar conexión"
    >
      <div className="space-y-1.5">
        <Label htmlFor="cn-handle">Cuenta / identificador</Label>
        <Input
          id="cn-handle"
          required
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@mi.cuenta o +52 …"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cn-status">Estado</Label>
        <select
          id="cn-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ConnectionStatus)}
          className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
        >
          {CONNECTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cn-token">Token (opcional)</Label>
        <Input id="cn-token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG…" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cn-webhook">Webhook (opcional)</Label>
        <Input
          id="cn-webhook"
          value={webhookStatus}
          onChange={(e) => setWebhookStatus(e.target.value)}
          placeholder="✓ verificado"
        />
      </div>
    </FormDialog>
  );
}
