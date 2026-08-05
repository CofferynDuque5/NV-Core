import { Trash2 } from "lucide-react";
import type { AutomationNode } from "@nv/domain";

import { nodeKind } from "@/lib/workflow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/empty-state";
import { Sliders } from "lucide-react";

const selectClass =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

/** Right-hand panel to edit the selected node's label + per-kind config. */
export function NodeInspector({
  node,
  onChange,
  onDelete,
}: {
  node: AutomationNode | null;
  onChange: (patch: Partial<AutomationNode>) => void;
  onDelete: () => void;
}) {
  if (!node) {
    return (
      <div className="p-4">
        <EmptyState
          icon={Sliders}
          title="Nada seleccionado"
          description="Selecciona un nodo del lienzo para configurar su comportamiento."
          compact
        />
      </div>
    );
  }

  const kind = nodeKind(node.type);
  const config = node.config ?? {};
  const selectedOption = String(config[kind.optionKey] ?? kind.options[0]?.value ?? "");
  const option = kind.options.find((o) => o.value === selectedOption);

  function setConfig(key: string, value: string) {
    onChange({ config: { ...config, [key]: value } });
  }

  function setOption(value: string) {
    const opt = kind.options.find((o) => o.value === value);
    onChange({ config: { ...config, [kind.optionKey]: value }, label: opt?.label ?? node!.label });
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-md text-sm"
          style={{ background: `${kind.accent}22`, color: kind.accent }}
        >
          {kind.glyph}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{kind.title}</span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nd-option">{kind.title.replace("…", "")}</Label>
        <select id="nd-option" value={selectedOption} onChange={(e) => setOption(e.target.value)} className={selectClass}>
          {kind.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nd-label">Etiqueta</Label>
        <Input id="nd-label" value={node.label} onChange={(e) => onChange({ label: e.target.value })} />
      </div>

      {option?.fields?.length ? (
        <div className="space-y-3 rounded-lg border border-line-soft bg-panel-raised p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Parámetros</p>
          {option.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`nd-${f.key}`}>{f.label}</Label>
              <Input
                id={`nd-${f.key}`}
                value={String(config[f.key] ?? "")}
                placeholder={f.placeholder}
                onChange={(e) => setConfig(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      ) : null}

      <button
        onClick={onDelete}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-state-danger/30 px-3 py-2 text-xs font-medium text-state-danger transition-colors hover:bg-state-danger/10"
      >
        <Trash2 className="size-3.5" /> Eliminar nodo
      </button>
    </div>
  );
}
