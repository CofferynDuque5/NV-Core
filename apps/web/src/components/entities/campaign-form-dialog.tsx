"use client";

import * as React from "react";
import {
  CAMPAIGN_STATUSES,
  CHANNEL_LIST,
  type Campaign,
  type CampaignStatus,
  type ChannelId,
} from "@nv/domain";

import { cn } from "@/lib/utils";
import { useCreateCampaign, useUpdateCampaign } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign?: Campaign | null;
}) {
  const isEdit = Boolean(campaign);
  const create = useCreateCampaign();
  const update = useUpdateCampaign();
  const pending = create.isPending || update.isPending;

  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<CampaignStatus>("borrador");
  const [channels, setChannels] = React.useState<ChannelId[]>([]);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(campaign?.name ?? "");
    setStatus(campaign?.status ?? "borrador");
    setChannels(campaign?.channels ?? []);
    setProgress(campaign?.progress ?? 0);
    setError(null);
  }, [open, campaign]);

  function toggle(id: ChannelId) {
    setChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function submit() {
    setError(null);
    const input = { name: name.trim(), status, channels, progress };
    const opts = {
      onSuccess: () => onOpenChange(false),
      onError: (err: unknown) => setError(errorMessage(err)),
    };
    if (campaign) update.mutate({ id: campaign.id, input }, opts);
    else create.mutate(input, opts);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar campaña" : "Nueva campaña"}
      description={isEdit ? "Actualiza la campaña." : "Planifica una campaña omnicanal."}
      onSubmit={submit}
      pending={pending}
      error={error}
      submitLabel={isEdit ? "Guardar cambios" : "Crear campaña"}
    >
      <div className="space-y-1.5">
        <Label htmlFor="cp-name">Nombre</Label>
        <Input id="cp-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
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
          <Label htmlFor="cp-progress">Progreso (%)</Label>
          <Input
            id="cp-progress"
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
        </div>
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
