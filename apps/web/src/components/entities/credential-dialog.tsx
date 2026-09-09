import * as React from "react";
import type { Integration } from "@nv/domain";

import { useSaveCredential, useRemoveCredential } from "@/hooks/use-domain-mutations";
import { useIntegrationCredentials } from "@/hooks/use-domain-data";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * In-app credential entry for an integration (OpenAI, Telegram API ID/Hash,
 * ImgBB…). Lets the user paste their keys instead of editing server env vars —
 * they're stored encrypted per workspace. Secrets are never pre-filled; a masked
 * preview is shown as the placeholder when a value is already stored.
 */
export function CredentialDialog({
  integration,
  open,
  onOpenChange,
}: {
  integration: Integration | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const save = useSaveCredential();
  const remove = useRemoveCredential();
  const creds = useIntegrationCredentials();
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const provider = integration?.provider ?? "";
  const fields = integration?.fields ?? [];
  const status = provider ? creds.data?.[provider] : undefined;
  const configured = Boolean(status?.configured);
  const preview = status?.preview ?? {};

  React.useEffect(() => {
    if (open) {
      setValues({});
      setError(null);
    }
  }, [open, provider]);

  function submit() {
    if (!provider) return;
    setError(null);
    const data: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.key] ?? "").trim();
      if (v) data[f.key] = v;
    }
    if (Object.keys(data).length === 0) {
      setError("Escribe al menos un valor para guardar.");
      return;
    }
    save.mutate(
      { provider, data },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Configurar ${integration?.name ?? ""}`}
      description="Pega tus credenciales. Se guardan cifradas en tu cuenta; no salen del servidor."
      onSubmit={submit}
      pending={save.isPending}
      error={error}
      submitLabel="Guardar"
    >
      {integration?.helpText || integration?.helpUrl ? (
        <div className="space-y-1.5 rounded-lg border border-brand/25 bg-brand/5 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
            ¿De dónde saco esta clave?
          </p>
          {integration?.helpText ? (
            <p className="text-xs leading-relaxed text-ink-muted">{integration.helpText}</p>
          ) : null}
          {integration?.helpUrl ? (
            <a
              href={integration.helpUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              Abrir {new URL(integration.helpUrl).host} ↗
            </a>
          ) : null}
        </div>
      ) : null}

      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`cred-${f.key}`}>{f.label}</Label>
          <Input
            id={`cred-${f.key}`}
            type={f.type === "password" ? "password" : "text"}
            autoComplete="off"
            value={values[f.key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            placeholder={preview[f.key] ? `Guardado: ${preview[f.key]}` : f.placeholder}
          />
          {f.help ? <p className="text-ink-faint text-[11px]">{f.help}</p> : null}
        </div>
      ))}

      {configured ? (
        <div className="border-line-soft bg-panel-raised flex items-center justify-between rounded-lg border px-3 py-2">
          <span className="text-ink-faint text-[11px]">
            Ya hay credenciales guardadas. Escribe nuevas para reemplazarlas.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-state-danger hover:text-state-danger"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(provider, {
                onSuccess: () => onOpenChange(false),
                onError: (err) => setError(errorMessage(err)),
              })
            }
          >
            Eliminar
          </Button>
        </div>
      ) : null}
    </FormDialog>
  );
}
