import type { AutomationEdge, AutomationNode, AutomationTraceStep } from "@nv/domain";

/**
 * Pure workflow interpreter. Walks the node/edge graph from its trigger,
 * evaluates condition nodes against a sample context (choosing the true/false
 * branch), and produces an ordered execution trace. Action/wait nodes are
 * *described* here (dry-run); real dispatch is layered on top by the service.
 *
 * Kept side-effect-free so branching logic is exhaustively unit-testable.
 */

const cfg = (node: AutomationNode): Record<string, unknown> => node.config ?? {};
const str = (v: unknown): string => (v == null ? "" : String(v));

/** Parse a condition node's `field` config ("stage=Cliente") into [key, value]. */
export function parseCondition(node: AutomationNode): { key: string; value: string } | null {
  const raw = str(cfg(node).field).trim();
  if (!raw || !raw.includes("=")) return null;
  const idx = raw.indexOf("=");
  return { key: raw.slice(0, idx).trim(), value: raw.slice(idx + 1).trim() };
}

/** Evaluate a condition node against the context. Unknown keys ⇒ false. */
export function evalCondition(node: AutomationNode, context: Record<string, string>): boolean {
  const parsed = parseCondition(node);
  if (!parsed) return false;
  return str(context[parsed.key]).toLowerCase() === parsed.value.toLowerCase();
}

/** Human-readable description of what a node does (or would do, in a dry-run). */
export function describeNode(node: AutomationNode): string {
  const c = cfg(node);
  switch (node.type) {
    case "trigger":
      return `Disparador: ${str(c.event) || "manual"}`;
    case "action":
      switch (str(c.action)) {
        case "send-message":
          return `Enviaría "${str(c.body)}" por ${str(c.channel) || "?"} a ${str(c.to) || "?"}`;
        case "publish":
          return `Publicaría en ${str(c.provider) || "?"}: "${str(c.message)}"`;
        case "run-campaign":
          return `Lanzaría la campaña ${str(c.campaignId) || "?"}`;
        default:
          return "Acción sin configurar";
      }
    case "wait":
      return `Esperaría ${str(c.duration) || "?"}`;
    case "cond":
      return `Condición: ${str(c.field) || "sin definir"}`;
    default:
      return node.label;
  }
}

function outgoing(edges: AutomationEdge[], nodeId: string): AutomationEdge[] {
  return edges.filter((e) => e.from === nodeId);
}

/**
 * Produce the execution trace for a dry-run. Follows edges from the single
 * trigger; at a condition node it takes the branch matching the evaluation
 * (edge.branch === "true"/"false"). A visited-guard prevents loops.
 */
export function planExecution(
  nodes: AutomationNode[],
  edges: AutomationEdge[],
  context: Record<string, string> = {},
): { steps: AutomationTraceStep[]; error?: string } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const triggers = nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) return { steps: [], error: "El flujo no tiene un disparador." };
  if (triggers.length > 1) return { steps: [], error: "El flujo tiene más de un disparador." };

  const steps: AutomationTraceStep[] = [];
  const visited = new Set<string>();
  // DFS stack preserving edge order for a deterministic, readable trace.
  const stack: string[] = [triggers[0]!.id];

  while (stack.length > 0) {
    const id = stack.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node) continue;

    const step: AutomationTraceStep = {
      nodeId: node.id,
      type: node.type,
      label: node.label,
      note: describeNode(node),
    };

    const outs = outgoing(edges, node.id);
    let nextIds: string[];
    if (node.type === "cond") {
      const decision = evalCondition(node, context);
      step.decision = decision ? "true" : "false";
      const branch = decision ? "true" : "false";
      // Prefer branch-labeled edges; fall back to any edge if unlabeled (legacy).
      const chosen = outs.filter((e) => e.branch === branch);
      const fallback = outs.filter((e) => e.branch == null);
      nextIds = (chosen.length > 0 ? chosen : fallback).map((e) => e.to);
      step.note += decision ? " → sí" : " → no";
    } else {
      nextIds = outs.map((e) => e.to);
    }

    steps.push(step);
    // Prepend to keep depth-first order along the chosen path.
    stack.unshift(...nextIds.filter((n) => !visited.has(n)));
  }

  return { steps };
}
