import type { AutomationEdge, AutomationNode, AutomationNodeType } from "@nv/domain";

/**
 * Pure workflow-graph logic for the visual builder — no React, unit-tested.
 * The editor is a thin rendering layer over these functions so the tricky
 * parts (connection rules, validation, layout, id generation) stay verifiable.
 */

export interface Graph {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

// ── Node catalog ─────────────────────────────────────────────────────────────
// The user never sees "n8n": they compose triggers → actions in plain language.
// Each node type has an option list that drives the inspector; the selected
// option is stored in node.config so the backend/n8n can execute it.

export interface CatalogOption {
  value: string;
  label: string;
  /** Extra config fields this option needs (rendered by the inspector). */
  fields?: { key: string; label: string; placeholder?: string }[];
}

export interface NodeKind {
  type: AutomationNodeType;
  title: string;
  glyph: string;
  accent: string;
  /** Which config key holds the selected option. */
  optionKey: string;
  options: CatalogOption[];
}

export const NODE_KINDS: NodeKind[] = [
  {
    type: "trigger",
    title: "Cuando…",
    glyph: "⚡",
    accent: "#3FB950",
    optionKey: "event",
    options: [
      { value: "message.received", label: "Llega un mensaje" },
      { value: "contact.created", label: "Se crea un contacto" },
      { value: "campaign.completed", label: "Termina una campaña" },
      { value: "post.published", label: "Se publica un post" },
      { value: "manual", label: "Manualmente / webhook" },
    ],
  },
  {
    type: "action",
    title: "Entonces…",
    glyph: "▶",
    accent: "#5B8DEF",
    optionKey: "action",
    options: [
      {
        value: "send-message",
        label: "Enviar un mensaje",
        fields: [
          { key: "channel", label: "Canal", placeholder: "wa / tg" },
          { key: "to", label: "Destinatario", placeholder: "+52…" },
          { key: "body", label: "Texto", placeholder: "Hola {{nombre}}…" },
        ],
      },
      {
        value: "publish",
        label: "Publicar en redes",
        fields: [
          { key: "provider", label: "Proveedor", placeholder: "ig / fb" },
          { key: "message", label: "Mensaje", placeholder: "Texto del post…" },
        ],
      },
      {
        value: "run-campaign",
        label: "Lanzar una campaña",
        fields: [{ key: "campaignId", label: "ID de campaña", placeholder: "cmp_…" }],
      },
    ],
  },
  {
    type: "wait",
    title: "Esperar…",
    glyph: "◷",
    accent: "#E3B341",
    optionKey: "duration",
    options: [
      { value: "5m", label: "5 minutos" },
      { value: "1h", label: "1 hora" },
      { value: "1d", label: "1 día" },
      { value: "3d", label: "3 días" },
    ],
  },
  {
    type: "cond",
    title: "Si…",
    glyph: "◆",
    accent: "#7C7CF0",
    optionKey: "field",
    options: [
      { value: "stage=Cliente", label: "El contacto es Cliente" },
      { value: "channel=wa", label: "El canal es WhatsApp" },
      { value: "replied=true", label: "Respondió el mensaje" },
    ],
  },
];

export function nodeKind(type: AutomationNodeType): NodeKind {
  return NODE_KINDS.find((k) => k.type === type) ?? NODE_KINDS[0]!;
}

// ── ID generation (deterministic, no Math.random for testability) ────────────
export function nextId(prefix: string, existing: { id: string }[]): string {
  let max = 0;
  for (const item of existing) {
    const m = item.id.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

// ── Graph mutations (immutable) ──────────────────────────────────────────────
export function addNode(graph: Graph, type: AutomationNodeType, x: number, y: number): Graph {
  const kind = nodeKind(type);
  const id = nextId("n", graph.nodes);
  const firstOption = kind.options[0]?.value;
  const node: AutomationNode = {
    id,
    type,
    label: kind.options[0]?.label ?? kind.title,
    x,
    y,
    config: firstOption ? { [kind.optionKey]: firstOption } : {},
  };
  return { nodes: [...graph.nodes, node], edges: graph.edges };
}

export function removeNode(graph: Graph, nodeId: string): Graph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== nodeId),
    edges: graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
  };
}

export function moveNode(graph: Graph, nodeId: string, x: number, y: number): Graph {
  return {
    nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
    edges: graph.edges,
  };
}

export function updateNode(graph: Graph, nodeId: string, patch: Partial<AutomationNode>): Graph {
  return {
    nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    edges: graph.edges,
  };
}

/** Would adding from→to create a cycle? (DFS from `to` back to `from`.) */
export function wouldCycle(graph: Graph, from: string, to: string): boolean {
  if (from === to) return true;
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const stack = [to];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === from) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const nxt of adj.get(cur) ?? []) stack.push(nxt);
  }
  return false;
}

/** Reason a connection is rejected, or null when it is valid. */
export function connectError(graph: Graph, from: string, to: string): string | null {
  if (from === to) return "Un nodo no puede conectarse a sí mismo.";
  const source = graph.nodes.find((n) => n.id === from);
  const target = graph.nodes.find((n) => n.id === to);
  if (target?.type === "trigger") return "Un disparador no puede recibir conexiones.";
  if (graph.edges.some((e) => e.from === from && e.to === to)) return "Esa conexión ya existe.";
  // A condition branches exactly two ways (sí / no).
  if (source?.type === "cond" && graph.edges.filter((e) => e.from === from).length >= 2)
    return "Una condición solo tiene 2 salidas (sí / no).";
  if (wouldCycle(graph, from, to)) return "Crearía un ciclo.";
  return null;
}

/**
 * Branch to assign a new edge leaving `from`. Condition nodes get "true" for
 * their first outgoing edge and "false" for the second; other nodes get none.
 */
export function branchForNewEdge(graph: Graph, from: string): "true" | "false" | undefined {
  const source = graph.nodes.find((n) => n.id === from);
  if (source?.type !== "cond") return undefined;
  const hasTrue = graph.edges.some((e) => e.from === from && e.branch === "true");
  return hasTrue ? "false" : "true";
}

export function addEdge(graph: Graph, from: string, to: string): Graph {
  if (connectError(graph, from, to)) return graph;
  const id = nextId("e", graph.edges);
  const branch = branchForNewEdge(graph, from);
  const edge: AutomationEdge = branch ? { id, from, to, branch } : { id, from, to };
  return { nodes: graph.nodes, edges: [...graph.edges, edge] };
}

/** Label for a condition's branch edge in the canvas ("Sí" / "No"). */
export function branchLabel(branch?: "true" | "false"): string {
  if (branch === "true") return "Sí";
  if (branch === "false") return "No";
  return "";
}

export function removeEdge(graph: Graph, edgeId: string): Graph {
  return { nodes: graph.nodes, edges: graph.edges.filter((e) => e.id !== edgeId) };
}

// ── Validation ───────────────────────────────────────────────────────────────
export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Node ids reachable from any trigger, following edges. */
export function reachableFromTriggers(graph: Graph): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const seen = new Set<string>();
  const stack = graph.nodes.filter((n) => n.type === "trigger").map((n) => n.id);
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const nxt of adj.get(cur) ?? []) stack.push(nxt);
  }
  return seen;
}

export function validateGraph(graph: Graph): ValidationResult {
  const errors: string[] = [];
  const triggers = graph.nodes.filter((n) => n.type === "trigger");
  if (graph.nodes.length === 0) errors.push("El flujo está vacío.");
  if (triggers.length === 0) errors.push("Añade un disparador (Cuando…).");
  if (triggers.length > 1) errors.push("Solo puede haber un disparador.");
  if (graph.nodes.some((n) => n.type !== "trigger") && graph.edges.length === 0)
    errors.push("Conecta los nodos entre sí.");
  const reachable = reachableFromTriggers(graph);
  const orphans = graph.nodes.filter((n) => n.type !== "trigger" && !reachable.has(n.id));
  if (orphans.length > 0)
    errors.push(`${orphans.length} nodo(s) sin conectar al disparador.`);
  return { ok: errors.length === 0, errors };
}

// ── Auto layout ──────────────────────────────────────────────────────────────
const COL_W = 240;
const ROW_H = 120;
const PAD_X = 40;
const PAD_Y = 40;

/**
 * Assign x/y by BFS depth from triggers (column = depth, row = order within
 * depth). Nodes unreachable from a trigger are stacked in a trailing column.
 */
export function autoLayout(graph: Graph): Graph {
  const depth = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const queue: string[] = [];
  for (const t of graph.nodes.filter((n) => n.type === "trigger")) {
    depth.set(t.id, 0);
    queue.push(t.id);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    const d = depth.get(cur) ?? 0;
    for (const nxt of adj.get(cur) ?? []) {
      if (!depth.has(nxt) || (depth.get(nxt) ?? 0) < d + 1) {
        depth.set(nxt, d + 1);
        queue.push(nxt);
      }
    }
  }
  const maxDepth = Math.max(0, ...[...depth.values()]);
  const perCol = new Map<number, number>();
  const nodes = graph.nodes.map((n) => {
    const d = depth.has(n.id) ? depth.get(n.id)! : maxDepth + 1;
    const row = perCol.get(d) ?? 0;
    perCol.set(d, row + 1);
    return { ...n, x: PAD_X + d * COL_W, y: PAD_Y + row * ROW_H };
  });
  return { nodes, edges: graph.edges };
}
