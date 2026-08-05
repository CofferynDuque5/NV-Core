import * as React from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Play, Plus, Save, AlertTriangle } from "lucide-react";
import type { Automation, AutomationNode } from "@nv/domain";

import { cn } from "@/lib/utils";
import {
  NODE_KINDS,
  addEdge,
  addNode,
  autoLayout,
  connectError,
  moveNode,
  nodeKind,
  removeEdge,
  removeNode,
  updateNode,
  validateGraph,
  type Graph,
} from "@/lib/workflow";
import { useRunAutomation, useUpdateAutomation } from "@/hooks/use-domain-mutations";
import { Button } from "@/components/ui/button";
import { NodeInspector } from "./node-inspector";

const NODE_W = 200;
const NODE_H = 68;
const SURFACE_W = 1600;
const SURFACE_H = 900;

/** Load a graph, laying it out if legacy nodes lack coordinates. */
function initGraph(a: Automation): Graph {
  const nodes = a.nodes ?? [];
  const edges = a.edges ?? [];
  const needsLayout = nodes.some((n) => n.x === undefined || n.y === undefined);
  const g: Graph = { nodes, edges };
  return needsLayout && nodes.length > 0 ? autoLayout(g) : g;
}

export function WorkflowEditor({ automation, onExit }: { automation: Automation; onExit: () => void }) {
  const [graph, setGraph] = React.useState<Graph>(() => initGraph(automation));
  const [status, setStatus] = React.useState<Automation["status"]>(automation.status);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [connectFrom, setConnectFrom] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  const update = useUpdateAutomation();
  const run = useRunAutomation();
  const drag = React.useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const validation = validateGraph(graph);

  const mutate = React.useCallback((next: Graph) => {
    setGraph(next);
    setDirty(true);
  }, []);

  function handleAdd(type: AutomationNode["type"]) {
    const count = graph.nodes.length;
    const x = 60 + (count % 4) * 30;
    const y = 60 + count * 24;
    const next = addNode(graph, type, x, y);
    mutate(next);
    setSelectedId(next.nodes[next.nodes.length - 1]!.id);
  }

  function handleNodeClick(id: string) {
    if (connectFrom && connectFrom !== id) {
      const err = connectError(graph, connectFrom, id);
      if (err) toast.error(err);
      else {
        mutate(addEdge(graph, connectFrom, id));
        toast.success("Nodos conectados");
      }
      setConnectFrom(null);
      return;
    }
    setSelectedId(id);
  }

  // ── Node dragging (native pointer events) ──────────────────────────────────
  function onNodePointerDown(e: React.PointerEvent, node: AutomationNode) {
    if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: node.id, sx: e.clientX, sy: e.clientY, ox: node.x ?? 0, oy: node.y ?? 0 };
  }
  function onNodePointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const x = Math.max(0, d.ox + (e.clientX - d.sx));
    const y = Math.max(0, d.oy + (e.clientY - d.sy));
    setGraph((g) => moveNode(g, d.id, x, y));
  }
  function onNodePointerUp() {
    if (drag.current) {
      drag.current = null;
      setDirty(true);
    }
  }

  function save() {
    update.mutate(
      { id: automation.id, input: { nodes: graph.nodes, edges: graph.edges, status } },
      { onSuccess: () => setDirty(false) },
    );
  }

  const canvasClick = () => {
    setSelectedId(null);
    setConnectFrom(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onExit}
          className="flex size-9 items-center justify-center rounded-lg border border-line-soft text-ink-muted transition-colors hover:text-ink"
          title="Volver"
          aria-label="Volver a la lista"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-semibold text-ink-bright">{automation.name}</h1>
          <p className="text-xs text-ink-muted">Diseña el flujo: arrastra nodos y conéctalos.</p>
        </div>

        {validation.ok ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-state-success/15 px-2.5 py-1 text-[11px] font-medium text-state-success">
            <CheckCircle2 className="size-3.5" /> Listo
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-state-warning/15 px-2.5 py-1 text-[11px] font-medium text-state-warning"
            title={validation.errors.join(" · ")}
          >
            <AlertTriangle className="size-3.5" /> {validation.errors.length} pendiente(s)
          </span>
        )}

        <button
          onClick={() => {
            setStatus((s) => (s === "activo" ? "pausado" : "activo"));
            setDirty(true);
          }}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            status === "activo"
              ? "bg-state-success/15 text-state-success"
              : "bg-line-strong/60 text-ink-muted",
          )}
        >
          {status === "activo" ? "Activo" : "Pausado"}
        </button>

        {automation.webhookUrl ? (
          <Button variant="secondary" size="sm" onClick={() => run.mutate(automation.id)} disabled={run.isPending}>
            <Play className="size-4" /> Ejecutar
          </Button>
        ) : null}
        <Button size="sm" onClick={save} disabled={!dirty || update.isPending}>
          <Save className="size-4" /> Guardar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[180px_1fr_280px]">
        {/* Palette */}
        <div className="nv-panel h-fit p-3">
          <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Nodos</p>
          <div className="space-y-1.5">
            {NODE_KINDS.map((k) => (
              <button
                key={k.type}
                onClick={() => handleAdd(k.type)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-line-soft bg-panel-raised px-2.5 py-2 text-left transition-colors hover:border-line-bright"
              >
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-md text-sm"
                  style={{ background: `${k.accent}22`, color: k.accent }}
                >
                  {k.glyph}
                </span>
                <span className="min-w-0 text-xs font-medium text-ink">{k.title}</span>
                <Plus className="ml-auto size-3.5 text-ink-faint" />
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div
          className="nv-panel relative overflow-auto bg-panel-sunken"
          style={{ minHeight: 520, maxHeight: "70vh" }}
        >
          {graph.nodes.length === 0 ? (
            <div className="grid h-[480px] place-items-center px-6 text-center">
              <div className="max-w-xs space-y-1">
                <p className="text-sm font-medium text-ink">Lienzo vacío</p>
                <p className="text-xs text-ink-faint">
                  Empieza añadiendo un <strong>Cuando…</strong> desde el panel izquierdo y conéctalo a una acción.
                </p>
              </div>
            </div>
          ) : (
            <div
              className="relative"
              style={{
                width: SURFACE_W,
                height: SURFACE_H,
                backgroundImage:
                  "radial-gradient(circle, hsl(var(--line)) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
              onClick={canvasClick}
            >
              {/* Edges */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {graph.edges.map((edge) => {
                  const a = graph.nodes.find((n) => n.id === edge.from);
                  const b = graph.nodes.find((n) => n.id === edge.to);
                  if (!a || !b) return null;
                  const x1 = (a.x ?? 0) + NODE_W;
                  const y1 = (a.y ?? 0) + NODE_H / 2;
                  const x2 = b.x ?? 0;
                  const y2 = (b.y ?? 0) + NODE_H / 2;
                  const d = `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`;
                  return (
                    <g key={edge.id} className="pointer-events-auto cursor-pointer">
                      <path d={d} fill="none" stroke="transparent" strokeWidth={14} onClick={(e) => {
                        e.stopPropagation();
                        mutate(removeEdge(graph, edge.id));
                        toast.success("Conexión eliminada");
                      }} />
                      <path d={d} fill="none" stroke="hsl(var(--line-bright))" strokeWidth={2} />
                    </g>
                  );
                })}
              </svg>

              {/* Nodes */}
              {graph.nodes.map((node) => {
                const kind = nodeKind(node.type);
                const isSel = node.id === selectedId;
                const isConnectSrc = node.id === connectFrom;
                return (
                  <div
                    key={node.id}
                    onPointerDown={(e) => onNodePointerDown(e, node)}
                    onPointerMove={onNodePointerMove}
                    onPointerUp={onNodePointerUp}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNodeClick(node.id);
                    }}
                    className={cn(
                      "absolute flex cursor-grab touch-none select-none items-center gap-2.5 rounded-xl border bg-panel px-3 py-2.5 shadow-sm active:cursor-grabbing",
                      isSel ? "border-brand ring-2 ring-brand/25" : "border-line-strong",
                      isConnectSrc && "ring-2 ring-brand",
                    )}
                    style={{ left: node.x ?? 0, top: node.y ?? 0, width: NODE_W, height: NODE_H }}
                  >
                    {/* input port */}
                    {node.type !== "trigger" ? (
                      <span
                        data-nodrag
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNodeClick(node.id);
                        }}
                        className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-line-bright bg-panel"
                        title="Entrada"
                      />
                    ) : null}

                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-sm"
                      style={{ background: `${kind.accent}22`, color: kind.accent }}
                    >
                      {kind.glyph}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                        {kind.title.replace("…", "")}
                      </span>
                      <span className="block truncate text-xs font-medium text-ink">{node.label}</span>
                    </span>

                    {/* output port */}
                    <button
                      data-nodrag
                      onClick={(e) => {
                        e.stopPropagation();
                        setConnectFrom(node.id);
                        toast("Elige el nodo destino", { icon: "🔗" });
                      }}
                      className={cn(
                        "absolute -right-1.5 top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 border-brand bg-panel transition-transform hover:scale-125",
                        isConnectSrc && "scale-125 bg-brand",
                      )}
                      title="Arrastra para conectar"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Inspector */}
        <div className="nv-panel h-fit">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-bright">Propiedades</h2>
          </div>
          <NodeInspector
            node={selected}
            onChange={(patch) => selectedId && mutate(updateNode(graph, selectedId, patch))}
            onDelete={() => {
              if (!selectedId) return;
              mutate(removeNode(graph, selectedId));
              setSelectedId(null);
            }}
          />
        </div>
      </div>

      {connectFrom ? (
        <p className="text-center text-xs text-brand">
          Conectando… haz clic en el nodo destino, o en el lienzo para cancelar.
        </p>
      ) : null}
    </div>
  );
}
