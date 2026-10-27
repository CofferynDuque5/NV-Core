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
  /**
   * Shown under the selector. Options the built-in engine does not run (they
   * only reach n8n) say so here, so nobody builds a flow that silently never fires.
   */
  hint?: string;
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

export const N8N_ONLY = "Solo funciona si conectas n8n: el motor integrado no lo ejecuta.";

// The first option of each kind is what a new node starts with, so it is
// always one the built-in engine (AutomationRunner) executes.
export const NODE_KINDS: NodeKind[] = [
  {
    type: "trigger",
    title: "Cuando…",
    glyph: "⚡",
    accent: "#3FB950",
    optionKey: "event",
    options: [
      {
        value: "message.received",
        label: "Llega un mensaje",
        fields: [{ key: "contains", label: "Solo si contiene (opcional)", placeholder: "precio, info, catálogo" }],
        hint: "Mensajes de WhatsApp o Telegram. Sin palabras clave, cualquier mensaje lo dispara.",
      },
      {
        value: "contact.inactive",
        label: "Un contacto lleva días sin escribir",
        fields: [{ key: "days", label: "Días sin escribir (1 a 365)", placeholder: "30" }],
        hint: "Se revisa cada hora. Corre una vez por contacto cada vez que cumple esos días en silencio; solo cuenta a quien los cumplió en la última semana, así no le escribe de golpe a tu lista antigua. Nunca a contactos dados de baja.",
      },
      { value: "contact.created", label: "Se crea un contacto", hint: N8N_ONLY },
      { value: "campaign.completed", label: "Termina una campaña", hint: N8N_ONLY },
      { value: "post.published", label: "Se publica un post", hint: N8N_ONLY },
      { value: "manual", label: "Manualmente / webhook", hint: "Se lanza con «Ejecutar» (requiere webhook de n8n)." },
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
        fields: [{ key: "body", label: "Texto", placeholder: "Hola {{nombre}}…" }],
        hint: "Responde en la misma conversación. {{nombre}} se cambia por el nombre del contacto.",
      },
      {
        value: "ai-reply",
        label: "Responder con IA",
        fields: [{ key: "prompt", label: "Instrucciones para la IA (opcional)", placeholder: "Eres el asistente de…" }],
        hint: "Necesita la IA configurada. Si la respuesta deriva a una persona, «Se resolvió» queda en no.",
      },
      {
        value: "create-contact",
        label: "Crear contacto",
        fields: [
          { key: "tag", label: "Etiqueta (opcional)", placeholder: "whatsapp" },
          { key: "stage", label: "Etapa", placeholder: "Lead" },
        ],
        hint: "Si ya existe un contacto con ese teléfono, no se duplica.",
      },
      {
        value: "notify",
        label: "Avisar al equipo",
        fields: [{ key: "title", label: "Título del aviso (opcional)", placeholder: "Nuevo interesado" }],
      },
      {
        value: "assign-human",
        label: "Pasar a una persona",
        hint: "Marca la conversación «requiere-humano» y avisa al equipo.",
      },
      {
        value: "publish",
        label: "Publicar en redes",
        fields: [
          { key: "provider", label: "Proveedor", placeholder: "ig / fb" },
          { key: "message", label: "Mensaje", placeholder: "Texto del post…" },
        ],
        hint: N8N_ONLY,
      },
      {
        value: "run-campaign",
        label: "Lanzar una campaña",
        fields: [{ key: "campaignId", label: "ID de campaña", placeholder: "cmp_…" }],
        hint: N8N_ONLY,
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
    // Keys the engine fills for every incoming message (see AutomationRunner).
    options: [
      { value: "intent=compra", label: "Quiere comprar", hint: "El mensaje habla de precio, pago o compra." },
      { value: "intent=soporte", label: "Pide ayuda", hint: "El mensaje habla de un problema o error." },
      { value: "resolved=true", label: "La IA lo resolvió", hint: "Úsalo después de «Responder con IA»." },
      { value: "newContact=true", label: "Es un contacto nuevo", hint: "Úsalo después de «Crear contacto»." },
      { value: "channel=wa", label: "El canal es WhatsApp" },
      { value: "channel=tg", label: "El canal es Telegram" },
    ],
  },
];

/**
 * The option a node has selected. Flows written before the editor (sample
 * data, older saves) use `kind: "ai_reply"` for actions and
 * `{ field: "intent", equals: "compra" }` for conditions; both are read too.
 */
export function selectedOption(node: AutomationNode): string {
  const kind = nodeKind(node.type);
  const c = node.config ?? {};
  if (node.type === "action") {
    const v = c.action ?? c.kind;
    return v == null ? "" : String(v).replace(/_/g, "-");
  }
  if (node.type === "cond") {
    const field = String(c.field ?? "");
    const equals = c.equals ?? c.value;
    return field && !field.includes("=") && equals != null ? `${field}=${String(equals)}` : field;
  }
  return String(c[kind.optionKey] ?? "");
}

/** Config after choosing `value`, dropping legacy keys the engine would read first. */
export function configWithOption(node: AutomationNode, value: string): Record<string, unknown> {
  const config: Record<string, unknown> = { ...(node.config ?? {}) };
  if (node.type === "action") delete config.kind;
  if (node.type === "cond") {
    delete config.equals;
    delete config.value;
  }
  return { ...config, [nodeKind(node.type).optionKey]: value };
}

/** Trigger keywords as typed in the inspector ("a, b") or stored as an array. */
export function keywordsText(v: unknown): string {
  return Array.isArray(v) ? v.map(String).join(", ") : v == null ? "" : String(v);
}

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
  const inactive = triggers.find((t) => t.config?.event === "contact.inactive");
  if (inactive) {
    const days = Number(String(inactive.config?.days ?? "").trim());
    if (!Number.isInteger(days) || days < 1 || days > 365)
      errors.push("Indica cuántos días sin escribir (un número entero de 1 a 365).");
  }
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
