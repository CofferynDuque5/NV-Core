"use client";

import * as React from "react";
import { CONTACT_STAGES, type ContactStage } from "@nv/domain";

import { useCreateContact } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ContactCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mutation = useCreateContact();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [stage, setStage] = React.useState<ContactStage>("Lead");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setTags("");
    setStage("Lead");
    setError(null);
  }

  function submit() {
    setError(null);
    mutation.mutate(
      {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        stage,
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
      title="Nuevo contacto"
      description="Añade un contacto a tu CRM."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Crear contacto"
    >
      <div className="space-y-1.5">
        <Label htmlFor="c-name">Nombre</Label>
        <Input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="c-phone">Teléfono</Label>
          <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-email">Email</Label>
          <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-company">Empresa / segmento</Label>
        <Input id="c-company" value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="c-tags">Etiquetas (coma)</Label>
          <Input id="c-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="VIP, Netflix" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-stage">Estado</Label>
          <select
            id="c-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as ContactStage)}
            className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
          >
            {CONTACT_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
    </FormDialog>
  );
}
