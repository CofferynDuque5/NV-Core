import { describe, expect, it } from "vitest";

import {
  addEdge,
  addNode,
  autoLayout,
  branchForNewEdge,
  branchLabel,
  connectError,
  nextId,
  reachableFromTriggers,
  removeNode,
  updateNode,
  validateGraph,
  wouldCycle,
  type Graph,
} from "./workflow";

const empty: Graph = { nodes: [], edges: [] };

/** Build a small graph: trigger n1 → action n2. */
function triggerAction(): Graph {
  let g = addNode(empty, "trigger", 0, 0); // n1
  g = addNode(g, "action", 0, 0); // n2
  g = addEdge(g, "n1", "n2");
  return g;
}

describe("nextId", () => {
  it("increments past the highest existing id", () => {
    expect(nextId("n", [])).toBe("n1");
    expect(nextId("n", [{ id: "n1" }, { id: "n3" }])).toBe("n4");
    expect(nextId("e", [{ id: "e2" }])).toBe("e3");
  });
});

describe("addNode", () => {
  it("adds a node with a default config option", () => {
    const g = addNode(empty, "trigger", 10, 20);
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]).toMatchObject({ id: "n1", type: "trigger", x: 10, y: 20 });
    expect(g.nodes[0]!.config).toEqual({ event: "message.received" });
  });
});

describe("removeNode", () => {
  it("removes the node and all its edges", () => {
    const g = removeNode(triggerAction(), "n2");
    expect(g.nodes.map((n) => n.id)).toEqual(["n1"]);
    expect(g.edges).toHaveLength(0);
  });
});

describe("updateNode", () => {
  it("patches a single node immutably", () => {
    const g = updateNode(triggerAction(), "n2", { label: "Enviar WA" });
    expect(g.nodes.find((n) => n.id === "n2")!.label).toBe("Enviar WA");
    expect(g.nodes.find((n) => n.id === "n1")!.label).not.toBe("Enviar WA");
  });
});

describe("condition branches", () => {
  /** trigger n1, cond n2, action n3, action n4. */
  function condGraph(): Graph {
    let g = addNode(empty, "trigger", 0, 0); // n1
    g = addNode(g, "cond", 0, 0); // n2
    g = addNode(g, "action", 0, 0); // n3
    g = addNode(g, "action", 0, 0); // n4
    g = addEdge(g, "n1", "n2");
    return g;
  }

  it("assigns true to the first cond edge and false to the second", () => {
    let g = condGraph();
    expect(branchForNewEdge(g, "n2")).toBe("true");
    g = addEdge(g, "n2", "n3");
    expect(g.edges.find((e) => e.from === "n2" && e.to === "n3")!.branch).toBe("true");
    expect(branchForNewEdge(g, "n2")).toBe("false");
    g = addEdge(g, "n2", "n4");
    expect(g.edges.find((e) => e.from === "n2" && e.to === "n4")!.branch).toBe("false");
  });

  it("caps a condition at two outgoing edges", () => {
    let g = condGraph();
    g = addEdge(g, "n2", "n3");
    g = addEdge(g, "n2", "n4");
    // a third node + connection is rejected
    g = addNode(g, "action", 0, 0); // n5
    expect(connectError(g, "n2", "n5")).toMatch(/2 salidas/);
  });

  it("non-cond nodes get no branch", () => {
    const g = triggerAction();
    expect(g.edges[0]!.branch).toBeUndefined();
    expect(branchForNewEdge(g, "n1")).toBeUndefined();
  });

  it("branchLabel maps to Sí/No", () => {
    expect(branchLabel("true")).toBe("Sí");
    expect(branchLabel("false")).toBe("No");
    expect(branchLabel(undefined)).toBe("");
  });
});

describe("connectError / addEdge", () => {
  it("rejects self, to-trigger, duplicate and cycles", () => {
    const g = triggerAction();
    expect(connectError(g, "n1", "n1")).toMatch(/sí mismo/);
    expect(connectError(g, "n2", "n1")).toMatch(/disparador no puede recibir/);
    expect(connectError(g, "n1", "n2")).toMatch(/ya existe/);
    // Add n3 and a path n2→n3, then n3→n2 would cycle.
    let g2 = addNode(g, "action", 0, 0); // n3
    g2 = addEdge(g2, "n2", "n3");
    expect(connectError(g2, "n3", "n2")).toMatch(/ciclo/);
  });
  it("accepts a valid new edge", () => {
    let g = addNode(triggerAction(), "wait", 0, 0); // n3
    expect(connectError(g, "n2", "n3")).toBeNull();
    g = addEdge(g, "n2", "n3");
    expect(g.edges).toHaveLength(2);
  });
  it("addEdge is a no-op on an invalid connection", () => {
    const g = triggerAction();
    expect(addEdge(g, "n1", "n2").edges).toHaveLength(1); // duplicate ignored
  });
});

describe("wouldCycle", () => {
  it("detects back edges", () => {
    let g = triggerAction(); // n1→n2
    g = addNode(g, "action", 0, 0); // n3
    g = addEdge(g, "n2", "n3"); // n2→n3
    expect(wouldCycle(g, "n3", "n1")).toBe(true); // n3→n1 closes the loop
    expect(wouldCycle(g, "n1", "n3")).toBe(false);
  });
});

describe("reachableFromTriggers", () => {
  it("follows edges from triggers only", () => {
    let g = triggerAction(); // n1(trigger)→n2
    g = addNode(g, "action", 0, 0); // n3 orphan
    const reachable = reachableFromTriggers(g);
    expect(reachable.has("n1")).toBe(true);
    expect(reachable.has("n2")).toBe(true);
    expect(reachable.has("n3")).toBe(false);
  });
});

describe("validateGraph", () => {
  it("flags empty graph", () => {
    expect(validateGraph(empty).ok).toBe(false);
  });
  it("requires exactly one trigger", () => {
    let g = addNode(empty, "action", 0, 0);
    expect(validateGraph(g).errors.some((e) => /disparador/i.test(e))).toBe(true);
    g = addNode(addNode(empty, "trigger", 0, 0), "trigger", 0, 0);
    expect(validateGraph(g).errors.some((e) => /un disparador/i.test(e))).toBe(true);
  });
  it("flags orphan nodes not connected to the trigger", () => {
    const g = addNode(triggerAction(), "action", 0, 0); // n3 orphan
    const res = validateGraph(g);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /sin conectar/.test(e))).toBe(true);
  });
  it("passes a connected trigger→action flow", () => {
    expect(validateGraph(triggerAction()).ok).toBe(true);
  });
});

describe("autoLayout", () => {
  it("places nodes in columns by depth from the trigger", () => {
    let g = triggerAction(); // n1(0)→n2(1)
    g = addNode(g, "wait", 0, 0); // n3
    g = addEdge(g, "n2", "n3"); // depth 2
    const laid = autoLayout(g);
    const x = (id: string) => laid.nodes.find((n) => n.id === id)!.x!;
    expect(x("n1")).toBeLessThan(x("n2"));
    expect(x("n2")).toBeLessThan(x("n3"));
  });
  it("stacks unreachable nodes in a trailing column", () => {
    const g = addNode(triggerAction(), "action", 0, 0); // n3 orphan
    const laid = autoLayout(g);
    const x = (id: string) => laid.nodes.find((n) => n.id === id)!.x!;
    expect(x("n3")).toBeGreaterThanOrEqual(x("n2"));
  });
});
