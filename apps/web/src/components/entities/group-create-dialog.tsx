
import * as React from "react";
import { CHANNEL_LIST, type ChannelId } from "@nv/domain";

import { useCreateGroup } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Only channels that can receive campaign sends to a group.
const GROUP_CHANNELS = CHANNEL_LIST.filter((c) => c.id === "wa" || c.id === "tg");

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
  const [kind, setKind] = React.useState<"group" | "channel">("group");
  const [remoteJid, setRemoteJid] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const isTgChannel = channel === "tg" && kind === "channel";

  function reset() {
    setName("");
    setChannel("wa");
    setKind("group");
    setRemoteJid("");
    setDescription("");
    setTags("");
    setError(null);
  }

  function submit() {
    setError(null);
    if (channel === "tg" && !remoteJid.trim()) {
      return setError(
        isTgChannel
          ? "Para un canal de Telegram, indica su @usuario o Chat ID (-100…)."
          : "Para Telegram, indica el Chat ID del grupo.",
      );
    }
    mutation.mutate(
      {
        name: name.trim(),
        channel,
        kind: channel === "tg" ? kind : "group",
        remoteJid: remoteJid.trim() || undefined,
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
      title="Nuevo grupo o canal"
      description="Crea un destino de difusión: grupo de WhatsApp/Telegram o canal de Telegram."
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
          {GROUP_CHANNELS.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {ch.name}
            </option>
          ))}
        </select>
      </div>

      {channel === "tg" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="g-kind">Tipo</Label>
            <select
              id="g-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as "group" | "channel")}
              className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
            >
              <option value="group">Grupo</option>
              <option value="channel">Canal (difusión)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-chatid">
              {isTgChannel ? "@usuario o Chat ID del canal" : "Chat ID de Telegram"}
            </Label>
            <Input
              id="g-chatid"
              value={remoteJid}
              onChange={(e) => setRemoteJid(e.target.value)}
              placeholder={isTgChannel ? "@mi_canal  o  -1001234567890" : "-1001234567890"}
            />
            <p className="text-[11px] text-ink-faint">
              {isTgChannel ? (
                <>
                  Agrega tu bot al canal como <b>administrador</b> y usa su <code>@usuario</code>{" "}
                  público o su <code>chat_id</code> (<code>-100…</code>).
                </>
              ) : (
                <>
                  Agrega tu bot al grupo de Telegram y usa su <code>chat_id</code> (empieza con{" "}
                  <code>-100…</code>). Puedes obtenerlo con @RawDataBot o el getUpdates del bot.
                </>
              )}
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="g-jid">JID de WhatsApp (opcional)</Label>
          <Input
            id="g-jid"
            value={remoteJid}
            onChange={(e) => setRemoteJid(e.target.value)}
            placeholder="1203630…@g.us (normalmente se sincroniza solo)"
          />
        </div>
      )}

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
