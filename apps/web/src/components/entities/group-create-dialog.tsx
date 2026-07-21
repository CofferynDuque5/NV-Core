"use client";

import * as React from "react";
import { CHANNEL_LIST, type ChannelId } from "@nv/domain";

import { useCreateGroup } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GroupCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mutation = useCreateGroup();
  const [name, setName] = React.useState("");
  const [channel, setChannel] = React.useState<ChannelId>("wa");
  const [description, setDescription] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setChannel("wa");
    setDescription("");
    setTags("");
    setError(null);
  }

  function submit() {
    setError(null);
    mutation.mutate(
      {
        name: name.trim(),
        channel,
        description: description.trim() || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
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

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Nuevo grupo"
      description="Crea un grupo de difusión."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Crear grupo"
    >
      <div className="space-y-1.5">
        <Label htmlFor="g-name">Nombre</Label>
        <Input id="g-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-channel">Canal</Label>
        <select
          id="g-channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as ChannelId)}
          className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
        >
          {CHANNEL_LIST.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {ch.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-desc">Descripción</Label>
        <Input id="g-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-tags">Etiquetas (coma)</Label>
        <Input id="g-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="VIP, Marketing" />
      </div>
    </FormDialog>
  );
}
