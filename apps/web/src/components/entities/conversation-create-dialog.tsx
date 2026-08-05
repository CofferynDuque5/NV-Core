
import * as React from "react";
import { CHANNEL_LIST, type ChannelId } from "@nv/domain";

import { useCreateConversation } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConversationCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const mutation = useCreateConversation();
  const [channel, setChannel] = React.useState<ChannelId>("wa");
  const [contactName, setContactName] = React.useState("");
  const [contactHandle, setContactHandle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const supportsHandle = channel === "wa" || channel === "tg";

  function reset() {
    setChannel("wa");
    setContactName("");
    setContactHandle("");
    setError(null);
  }

  function submit() {
    setError(null);
    const handle = contactHandle.trim();
    mutation.mutate(
      {
        channel,
        contactName: contactName.trim(),
        ...(supportsHandle && handle ? { contactHandle: handle } : {}),
      },
      {
        onSuccess: (conv) => {
          reset();
          onOpenChange(false);
          onCreated?.(conv.id);
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
      title="Nueva conversación"
      description="Inicia un hilo con un contacto."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Crear conversación"
    >
      <div className="space-y-1.5">
        <Label htmlFor="cv-name">Contacto</Label>
        <Input
          id="cv-name"
          required
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Nombre del contacto"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cv-channel">Canal</Label>
        <select
          id="cv-channel"
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
      {supportsHandle ? (
        <div className="space-y-1.5">
          <Label htmlFor="cv-handle">
            {channel === "wa" ? "Teléfono (E.164)" : "Chat ID de Telegram"}{" "}
            <span className="text-ink-faint">· opcional</span>
          </Label>
          <Input
            id="cv-handle"
            value={contactHandle}
            onChange={(e) => setContactHandle(e.target.value)}
            placeholder={channel === "wa" ? "+34600111222" : "123456789"}
          />
          <p className="text-xs text-ink-faint">
            Necesario para entregar respuestas al destinatario por {channel === "wa" ? "WhatsApp" : "Telegram"}.
          </p>
        </div>
      ) : null}
    </FormDialog>
  );
}
