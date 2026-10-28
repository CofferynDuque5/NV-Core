import * as React from "react";
import { Plus, X } from "lucide-react";
import { campaignFooter } from "@nv/domain";

import { useBrandLinks } from "@/hooks/use-domain-data";
import { useSaveBrandLinks } from "@/hooks/use-domain-mutations";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SUGGESTED = ["Instagram", "Facebook", "TikTok", "YouTube", "WhatsApp", "Telegram"];
const MAX_LINKS = 8;

type Row = { label: string; url: string };

/**
 * The brand's social links and website. Group campaigns end with them (when
 * the campaign's «pie» is on), followed by the NV Marketing credit.
 */
export function BrandLinksTab() {
  const links = useBrandLinks();
  const save = useSaveBrandLinks();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [website, setWebsite] = React.useState("");

  React.useEffect(() => {
    if (!links.data) return;
    setRows(links.data.socialLinks.length ? links.data.socialLinks : [{ label: "Instagram", url: "" }]);
    setWebsite(links.data.website ?? "");
  }, [links.data]);

  const clean = rows.filter((r) => r.label.trim() && r.url.trim());
  const preview = campaignFooter({ socialLinks: clean, website: website.trim() || null });
  const used = new Set(rows.map((r) => r.label));

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel>
        <PanelHeader
          title="Redes y web de la marca"
          description="Se agregan al final de los mensajes de campañas a grupos, si la campaña tiene el pie activado."
        />
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ socialLinks: clean, website: website.trim() || null });
          }}
        >
          <div className="space-y-2">
            <Label>Redes sociales</Label>
            {rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <Input
                  aria-label={`Red ${i + 1}`}
                  value={r.label}
                  onChange={(e) => setRow(i, { label: e.target.value })}
                  placeholder="Instagram"
                  className="w-full sm:w-36"
                  list="brand-link-names"
                />
                <Input
                  aria-label={`Enlace ${i + 1}`}
                  value={r.url}
                  onChange={(e) => setRow(i, { url: e.target.value })}
                  placeholder="instagram.com/tumarca"
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  className="rounded-md p-1.5 text-ink-faint hover:bg-state-danger/10 hover:text-state-danger"
                  aria-label={`Quitar ${r.label || "red"}`}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <datalist id="brand-link-names">
              {SUGGESTED.filter((s) => !used.has(s)).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {rows.length < MAX_LINKS ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setRows((prev) => [...prev, { label: SUGGESTED.find((s) => !used.has(s)) ?? "", url: "" }])
                }
              >
                <Plus className="size-4" /> Agregar red
              </Button>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-website">Página web</Label>
            <Input
              id="brand-website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="tumarca.com"
            />
          </div>
          <Button type="submit" disabled={save.isPending || links.isLoading}>
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </Panel>
      <Panel>
        <PanelHeader title="Así termina cada mensaje" />
        <pre className="whitespace-pre-wrap break-words p-5 font-sans text-xs text-ink-muted" data-testid="footer-preview">
          {preview}
        </pre>
      </Panel>
    </div>
  );
}
