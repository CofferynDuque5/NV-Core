import * as React from "react";
import type { Affiliate } from "@nv/domain";

import { useCreateAffiliate, useUpdateAffiliate } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

export function AffiliateFormDialog({
  open,
  onOpenChange,
  affiliate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  affiliate?: Affiliate;
}) {
  const isEdit = !!affiliate;
  const create = useCreateAffiliate();
  const update = useUpdateAffiliate();
  const pending = create.isPending || update.isPending;

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [commissionPct, setCommissionPct] = React.useState(20);
  const [destinationUrl, setDestinationUrl] = React.useState("");
  const [status, setStatus] = React.useState<Affiliate["status"]>("active");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(affiliate?.name ?? "");
    setEmail(affiliate?.email ?? "");
    setCode(affiliate?.code ?? "");
    setCommissionPct(affiliate?.commissionPct ?? 20);
    setDestinationUrl(affiliate?.destinationUrl ?? "");
    setStatus(affiliate?.status ?? "active");
    setError(null);
  }, [open, affiliate]);

  function submit() {
    setError(null);
    if (!name.trim()) return setError("El nombre es obligatorio.");
    if (!email.trim()) return setError("El correo es obligatorio.");
    const onSuccess = () => onOpenChange(false);
    const onError = (err: unknown) => setError(errorMessage(err));
    if (isEdit && affiliate) {
      update.mutate(
        {
          id: affiliate.id,
          input: { name: name.trim(), email: email.trim(), commissionPct, destinationUrl: destinationUrl.trim() || undefined, status },
        },
        { onSuccess, onError },
      );
    } else {
      create.mutate(
        {
          name: name.trim(),
          email: email.trim(),
          code: code.trim() || undefined,
          commissionPct,
          destinationUrl: destinationUrl.trim() || undefined,
          status,
        },
        { onSuccess, onError },
      );
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar afiliado" : "Nuevo afiliado"}
      description="Un socio con enlace de referido y comisión por conversión."
      onSubmit={submit}
      pending={pending}
      error={error}
      submitLabel={isEdit ? "Guardar" : "Crear afiliado"}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="af-name">Nombre</Label>
          <Input id="af-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="af-email">Correo</Label>
          <Input id="af-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>

      {!isEdit ? (
        <div className="space-y-1.5">
          <Label htmlFor="af-code">Código (opcional)</Label>
          <Input
            id="af-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="se genera automáticamente"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="af-pct">Comisión (%)</Label>
          <Input
            id="af-pct"
            type="number"
            min={0}
            max={100}
            value={commissionPct}
            onChange={(e) => setCommissionPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="af-status">Estado</Label>
          <select
            id="af-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Affiliate["status"])}
            className={selectClass}
          >
            <option value="active">Activo</option>
            <option value="paused">Pausado</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="af-dest">Destino del enlace (opcional)</Label>
        <Input
          id="af-dest"
          value={destinationUrl}
          onChange={(e) => setDestinationUrl(e.target.value)}
          placeholder="https://…/oferta"
        />
      </div>
    </FormDialog>
  );
}
