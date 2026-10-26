import { describe, expect, it } from "vitest";
import type { AutomationEdge, AutomationNode } from "@nv/domain";

import { describeNode, evalCondition, parseCondition, planExecution } from "./workflow-executor";

const node = (id: string, type: AutomationNode["type"], config: Record<string, unknown> = {}): AutomationNode => ({
  id,
  type,
  label: id,
  config,
});
const edge = (from: string, to: string, branch?: "true" | "false"): AutomationEdge => ({
  id: `${from}-${to}`,
  from,
  to,
  branch,
});

describe("parseCondition / evalCondition", () => {
  it("parses key=value and evaluates against context (case-insensitive)", () => {
    const n = node("c", "cond", { field: "stage=Cliente" });
    expect(parseCondition(n)).toEqual({ key: "stage", value: "Cliente" });
    expect(evalCondition(n, { stage: "Cliente" })).toBe(true);
    expect(evalCondition(n, { stage: "cliente" })).toBe(true);
    expect(evalCondition(n, { stage: "Lead" })).toBe(false);
    expect(evalCondition(n, {})).toBe(false);
  });

  it("returns null / false for malformed conditions", () => {
    expect(parseCondition(node("c", "cond", { field: "nope" }))).toBeNull();
    expect(evalCondition(node("c", "cond", {}), { x: "y" })).toBe(false);
  });
});

describe("planExecution", () => {
  it("errors when there is no trigger or more than one", () => {
    expect(planExecution([node("a", "action")], []).error).toMatch(/disparador/);
    expect(
      planExecution([node("t1", "trigger"), node("t2", "trigger")], []).error,
    ).toMatch(/más de un/);
  });

  it("walks a linear flow trigger → action", () => {
    const nodes = [
      node("t", "trigger", { event: "contact.created" }),
      node("a", "action", { action: "send-message", channel: "wa", to: "+52", body: "Hola" }),
    ];
    const res = planExecution(nodes, [edge("t", "a")]);
    expect(res.error).toBeUndefined();
    expect(res.steps.map((s) => s.nodeId)).toEqual(["t", "a"]);
    expect(res.steps[1]!.note).toContain("Enviaría");
  });

  it("takes the TRUE branch of a condition and skips the false path", () => {
    const nodes = [
      node("t", "trigger"),
      node("c", "cond", { field: "stage=Cliente" }),
      node("yes", "action", { action: "publish", provider: "ig", message: "VIP" }),
      node("no", "action", { action: "send-message", channel: "wa", to: "+1", body: "hi" }),
    ];
    const edges = [edge("t", "c"), edge("c", "yes", "true"), edge("c", "no", "false")];
    const res = planExecution(nodes, edges, { stage: "Cliente" });
    const ids = res.steps.map((s) => s.nodeId);
    expect(ids).toEqual(["t", "c", "yes"]);
    expect(ids).not.toContain("no");
    expect(res.steps[1]!.decision).toBe("true");
  });

  it("takes the FALSE branch when the condition fails", () => {
    const nodes = [
      node("t", "trigger"),
      node("c", "cond", { field: "stage=Cliente" }),
      node("yes", "action", { action: "publish" }),
      node("no", "action", { action: "send-message" }),
    ];
    const edges = [edge("t", "c"), edge("c", "yes", "true"), edge("c", "no", "false")];
    const res = planExecution(nodes, edges, { stage: "Lead" });
    expect(res.steps.map((s) => s.nodeId)).toEqual(["t", "c", "no"]);
    expect(res.steps[1]!.decision).toBe("false");
  });

  it("describes wait nodes and continues", () => {
    const nodes = [node("t", "trigger"), node("w", "wait", { duration: "1h" }), node("a", "action", { action: "publish" })];
    const res = planExecution(nodes, [edge("t", "w"), edge("w", "a")]);
    expect(res.steps.map((s) => s.nodeId)).toEqual(["t", "w", "a"]);
    expect(res.steps[1]!.note).toContain("Esperaría 1h");
  });

  it("guards against cycles (visited set)", () => {
    const nodes = [node("t", "trigger"), node("a", "action", { action: "publish" })];
    const edges = [edge("t", "a"), edge("a", "t")];
    const res = planExecution(nodes, edges);
    expect(res.steps.map((s) => s.nodeId)).toEqual(["t", "a"]);
  });
});

describe("flows saved before the editor", () => {
  it("evaluates { field, equals } conditions", () => {
    const cond = node("c", "cond", { field: "intent", equals: "compra" });
    expect(parseCondition(cond)).toEqual({ key: "intent", value: "compra" });
    expect(evalCondition(cond, { intent: "compra" })).toBe(true);
    expect(evalCondition(cond, { intent: "soporte" })).toBe(false);
  });

  it("describes actions stored as kind or action, and flags the n8n-only ones", () => {
    expect(describeNode(node("a", "action", { kind: "ai_reply" }))).toBe("Respondería con IA");
    expect(describeNode(node("a", "action", { action: "assign-human" }))).toBe("Pasaría la conversación a una persona");
    expect(describeNode(node("a", "action", { action: "run-campaign", campaignId: "c1" }))).toContain("solo con n8n");
  });
});
