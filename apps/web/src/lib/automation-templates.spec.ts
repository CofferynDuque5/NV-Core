import { describe, expect, it } from "vitest";

import { AUTOMATION_TEMPLATES, templateToInput } from "./automation-templates";
import { N8N_ONLY, nodeKind, selectedOption, validateGraph } from "./workflow";

describe("automation templates", () => {
  it("are valid graphs with unique ids", () => {
    expect(new Set(AUTOMATION_TEMPLATES.map((t) => t.id)).size).toBe(AUTOMATION_TEMPLATES.length);
    for (const t of AUTOMATION_TEMPLATES) {
      expect(validateGraph({ nodes: t.nodes, edges: t.edges }), t.id).toEqual({ ok: true, errors: [] });
    }
  });

  it("only use steps the built-in engine runs", () => {
    for (const t of AUTOMATION_TEMPLATES) {
      for (const node of t.nodes) {
        const option = nodeKind(node.type).options.find((o) => o.value === selectedOption(node));
        expect(option, `${t.id}/${node.id}`).toBeDefined();
        expect(option?.hint).not.toBe(N8N_ONLY);
      }
    }
  });

  it("branch only out of conditions", () => {
    for (const t of AUTOMATION_TEMPLATES) {
      const types = new Map(t.nodes.map((n) => [n.id, n.type]));
      for (const edge of t.edges) {
        if (edge.branch) expect(types.get(edge.from), `${t.id}/${edge.id}`).toBe("cond");
      }
    }
  });

  it("are created paused and laid out", () => {
    const input = templateToInput(AUTOMATION_TEMPLATES[0]!);
    expect(input.status).toBe("pausado");
    expect(input.name).toBe(AUTOMATION_TEMPLATES[0]!.name);
    // One column, in run order: trigger on top, last step at the bottom.
    expect(new Set(input.nodes?.map((n) => n.x)).size).toBe(1);
    const ys = input.nodes!.map((n) => n.y ?? -1);
    expect(new Set(ys).size).toBe(ys.length);
    const byId = new Map(input.nodes!.map((n) => [n.id, n.y ?? 0]));
    for (const edge of input.edges ?? []) expect(byId.get(edge.to)!).toBeGreaterThan(byId.get(edge.from)!);
  });
});
