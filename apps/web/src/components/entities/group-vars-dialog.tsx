
import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Group } from "@nv/domain";

import { useGroupVars } from "@/hooks/use-domain-data";
import { useSetGroupVars } from "@/hooks/use-domain-mutations";
import { FormDialog, errorMessage } from "./form-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface VarRow {
  key: string;
  value: string;
}

export function GroupVarsDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group: Group | null;
}) {
  const groupId = group?.id ?? null;
  const varsQuery = useGroupVars(open ? groupId : null);
  const setVars = useSetGroupVars(groupId ?? "");

  const [rows, setRows] = React.useState<VarRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const data = varsQuery.data;
  React.useEffect(() => {
    if (!open) return;
    if (!data) return;
    const entries = Object.entries(data).map(([key, value]) => ({ key, value }));
    setRows(entries);
    setError(null);
  }, [open, data]);

  function updateRow(index: number, patch: Partial<VarRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    setError(null);
    const vars: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      vars[key] = row.value;
    }
    setVars.mutate(vars, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => setError(errorMessage(err)),
    });
  }

  const loading = varsQuery.isLoading && open;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Variables del grupo"
      description={
        group ? `Variables usadas al enviar a "${group.name}".` : "Variables del grupo."
      }
      onSubmit={submit}
      pending={setVars.isPending}
      error={error}
      submitLabel="Guardar variables"
    >
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin" /> Cargando variables…
        </div>
      ) : (
        <div className="space-y-2">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-line-soft bg-panel-raised px-3 py-2 text-xs text-ink-faint">
              Aún no hay variables. Añade pares clave/valor que podrás usar como{" "}
              <code className="text-ink-muted">{"{{clave}}"}</code> en tus mensajes.
            </p>
          ) : (
            rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="clave"
                  value={row.key}
                  onChange={(e) => updateRow(i, { key: e.target.value })}
                  className="flex-1"
                />
                <Input
                  placeholder="valor"
                  value={row.value}
                  onChange={(e) => updateRow(i, { value: e.target.value })}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-state-danger/10 hover:text-state-danger"
                  title="Eliminar"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}

          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="size-4" /> Añadir variable
          </Button>
        </div>
      )}
    </FormDialog>
  );
}
