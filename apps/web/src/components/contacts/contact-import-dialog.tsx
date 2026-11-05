import * as React from "react";
import type { ContactImportResult } from "@nv/domain";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";

import { useServices } from "@/hooks/use-services";
import { useWorkspace } from "@/hooks/use-workspace";
import { useImportContacts } from "@/hooks/use-domain-mutations";
import {
  CONTACT_FIELDS,
  guessMapping,
  readSpreadsheet,
  toImportCsv,
  type ContactField,
} from "@/lib/sheet-import";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const selectCls =
  "h-8 w-full rounded-md border border-line-soft bg-panel-raised px-1.5 text-xs text-ink focus-visible:border-brand/60 focus-visible:outline-none";

/**
 * «Importar contactos»: pick a CSV or Excel file, check which column is what,
 * see the first rows and how many are new / already in Contactos, then import.
 */
export function ContactImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const svc = useServices();
  const ws = useWorkspace();
  const importContacts = useImportContacts();
  const [fileName, setFileName] = React.useState("");
  const [rows, setRows] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<ContactField[]>([]);
  const [hasHeader, setHasHeader] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<ContactImportResult | null>(null);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    if (open) return;
    setFileName("");
    setRows([]);
    setMapping([]);
    setError(null);
    setPreview(null);
    setHasHeader(true);
  }, [open]);

  const headers = hasHeader ? (rows[0] ?? []) : (rows[0] ?? []).map((_, i) => `Columna ${i + 1}`);
  const body = hasHeader ? rows.slice(1) : rows;
  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length));
  const csv = rows.length ? toImportCsv(body, mapping) : "";
  const hasName = mapping.includes("name");

  // Ask the server what would happen (new / already there / errors) whenever the mapping changes.
  React.useEffect(() => {
    if (!open || !hasName || !csv) {
      setPreview(null);
      return;
    }
    let live = true;
    setChecking(true);
    const t = window.setTimeout(() => {
      svc.contacts
        .importCsv(ws.id, csv, { dryRun: true })
        .then((r) => live && setPreview(r))
        .catch((e: unknown) => live && setError((e as Error).message))
        .finally(() => live && setChecking(false));
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, csv, hasName, ws.id, svc]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const data = await readSpreadsheet(file);
      if (data.length === 0) throw new Error("El archivo está vacío.");
      setFileName(file.name);
      setRows(data);
      const guessed = guessMapping(data[0]!);
      const w = Math.max(...data.slice(0, 50).map((r) => r.length));
      setMapping(Array.from({ length: w }, (_, i) => guessed[i] ?? ""));
      setHasHeader(guessed.some(Boolean));
    } catch (err) {
      setRows([]);
      setError((err as Error).message);
    }
  }

  function setField(i: number, f: ContactField) {
    setMapping((cur) => cur.map((x, j) => (j === i ? f : f && x === f ? "" : x)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar contactos</DialogTitle>
          <DialogDescription>
            Sube un Excel (.xlsx) o CSV. Revisa qué es cada columna y mira cuántos son nuevos antes de importar. Los que ya
            están (mismo teléfono o correo) se omiten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="border-line-soft hover:border-brand/60 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
            <FileSpreadsheet className="text-brand size-5" />
            <span className="text-ink min-w-0 flex-1 truncate">{fileName || "Elegir archivo Excel o CSV…"}</span>
            <input
              type="file"
              accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Archivo de contactos"
              className="hidden"
              onChange={onFile}
            />
          </label>
          {error ? <p className="text-state-danger text-xs">{error}</p> : null}

          {rows.length > 0 ? (
            <>
              <label className="text-ink-muted inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="size-4 accent-[#5F86F2]"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                />
                La primera fila son los títulos de las columnas
              </label>
              <div className="border-line-soft max-h-72 overflow-auto rounded-lg border" data-testid="import-preview">
                <table className="w-full text-xs">
                  <thead className="bg-panel-raised sticky top-0">
                    <tr>
                      {Array.from({ length: width }, (_, i) => (
                        <th key={i} className="min-w-[8rem] p-1.5 text-left align-top font-normal">
                          <div className="text-ink-faint mb-1 truncate">{headers[i] || `Columna ${i + 1}`}</div>
                          <select
                            aria-label={`Qué es la columna ${headers[i] || i + 1}`}
                            className={selectCls}
                            value={mapping[i] ?? ""}
                            onChange={(e) => setField(i, e.target.value as ContactField)}
                          >
                            <option value="">No importar</option>
                            {CONTACT_FIELDS.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {body.slice(0, 8).map((r, i) => (
                      <tr key={i} className="border-line-soft border-t">
                        {Array.from({ length: width }, (_, j) => (
                          <td key={j} className={mapping[j] ? "text-ink p-1.5" : "text-ink-faint p-1.5 line-through"}>
                            {r[j] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-ink-faint text-[11px]">
                {body.length} filas en el archivo{body.length > 8 ? " (se muestran 8)" : ""}.
              </p>
              <div className="bg-panel-raised rounded-lg px-3 py-2 text-sm" data-testid="import-summary">
                {!hasName ? (
                  <span className="text-state-warning">Elige qué columna es el «Nombre» para continuar.</span>
                ) : checking && !preview ? (
                  <span className="text-ink-muted inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Revisando…
                  </span>
                ) : preview ? (
                  <span className="text-ink">
                    <b>{preview.created}</b> nuevos · <b>{preview.skipped}</b> ya están en Contactos o repetidos
                    {preview.errors.length ? (
                      <span className="text-state-warning"> · {preview.errors.length} con error ({preview.errors[0]})</span>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            data-testid="import-confirm"
            disabled={!hasName || !preview || preview.created === 0 || importContacts.isPending}
            onClick={() => importContacts.mutate(csv, { onSuccess: () => onOpenChange(false) })}
          >
            {importContacts.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Importar {preview?.created ? preview.created : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
