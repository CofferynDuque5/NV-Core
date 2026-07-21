"use client";

import * as React from "react";
import { CAMPAIGN_STATUSES, CHANNEL_LIST, type CampaignStatus, type ChannelId } from "@nv/domain";

import { cn } from "@/lib/utils";
import { useCreateCampaign } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CampaignCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mutation = useCreateCampaign();
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<CampaignStatus>("borrador");
  const [channels, setChannels] = React.useState<ChannelId[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setStatus("borrador");
    setChannels([]);
    setError(null);
  }

  function toggle(id: ChannelId) {
    setChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function submit() {
    setError(null);
    mutation.mutate(
      { name: name.trim(), status, channels },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Nueva campaña"
      description="Planifica una campaña omnicanal."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Crear campaña"
    >
      <div className="space-y-1.5">
        <Label htmlFor="cp-name">Nombre</Label>
        <Input id="cp-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-status">Estado</Label>
        <select
          id="cp-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as CampaignStatus)}
          className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
        >
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Canales</Label>
        <div className="flex flex-wrap gap-1.5">
          {CHANNEL_LIST.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => toggle(ch.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                channels.includes(ch.id)
                  ? "border-brand/60 bg-brand/10 text-ink"
                  : "border-line-soft text-ink-muted hover:border-line-bright",
              )}
            >
              {ch.name}
            </button>
          ))}
        </div>
      </div>
    </FormDialog>
  );
}
