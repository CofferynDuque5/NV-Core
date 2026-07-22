"use client";

import * as React from "react";
import { ROLES, type Role } from "@nv/domain";

import { useAddMember } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InviteMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mutation = useAddMember();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("Editor");
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setEmail("");
    setRole("Editor");
    setError(null);
  }

  function submit() {
    setError(null);
    mutation.mutate(
      { email: email.trim(), role },
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
      title="Invitar miembro"
      description="El usuario debe tener una cuenta registrada. Se le asignará el rol elegido."
      onSubmit={submit}
      pending={mutation.isPending}
      error={error}
      submitLabel="Invitar"
    >
      <div className="space-y-1.5">
        <Label htmlFor="m-email">Email</Label>
        <Input
          id="m-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="persona@empresa.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="m-role">Rol</Label>
        <select
          id="m-role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
    </FormDialog>
  );
}
