import { describe, expect, it } from "vitest";
import type { SegmentRule } from "@nv/domain";

import { buildContactWhere, ruleError, rulesError } from "./segment-eval";

const r = (field: string, operator: string, value = ""): SegmentRule =>
  ({ field, operator, value }) as SegmentRule;

describe("ruleError", () => {
  it("accepts valid rules", () => {
    expect(ruleError(r("name", "contains", "ana"))).toBeNull();
    expect(ruleError(r("tags", "has_tag", "vip"))).toBeNull();
    expect(ruleError(r("stage", "equals", "Cliente"))).toBeNull();
    expect(ruleError(r("createdAt", "in_last_days", "30"))).toBeNull();
    expect(ruleError(r("email", "is_set"))).toBeNull();
  });

  it("rejects unknown field/operator", () => {
    expect(ruleError(r("nope", "equals", "x"))).toMatch(/Campo desconocido/);
    expect(ruleError(r("name", "nope", "x"))).toMatch(/Operador desconocido/);
  });

  it("rejects operator not applicable to the field type", () => {
    expect(ruleError(r("name", "has_tag", "x"))).toMatch(/no aplica/);
    expect(ruleError(r("createdAt", "contains", "x"))).toMatch(/no aplica/);
  });

  it("requires a value for value-bearing operators", () => {
    expect(ruleError(r("name", "contains", ""))).toMatch(/requiere un valor/);
    expect(ruleError(r("name", "contains", "  "))).toMatch(/requiere un valor/);
  });

  it("validates number and date value hints", () => {
    expect(ruleError(r("createdAt", "in_last_days", "abc"))).toMatch(/número de días/);
    expect(ruleError(r("createdAt", "before", "not-a-date"))).toMatch(/fecha válida/);
  });

  it("validates enum values for single-value ops", () => {
    expect(ruleError(r("stage", "equals", "Fantasma"))).toMatch(/no es un valor válido/);
    expect(ruleError(r("stage", "in", "Cliente,Lead"))).toBeNull(); // csv not option-checked
  });

  it("rulesError returns the first error or null", () => {
    expect(rulesError([r("name", "contains", "a"), r("x", "equals", "y")])).toMatch(/desconocido/);
    expect(rulesError([r("name", "contains", "a")])).toBeNull();
  });
});

describe("buildContactWhere", () => {
  const now = new Date("2026-08-08T00:00:00.000Z");

  it("scopes to the workspace and matches nothing when no valid rules", () => {
    expect(buildContactWhere("w1", [], "all", now)).toEqual({ workspaceSlug: "w1", id: "__none__" });
    // an invalid-only set is also treated as no audience
    expect(buildContactWhere("w1", [r("bad", "equals", "x")], "all", now)).toEqual({
      workspaceSlug: "w1",
      id: "__none__",
    });
  });

  it("combines with AND for match=all and OR for match=any", () => {
    const rules = [r("name", "contains", "ana"), r("stage", "equals", "Cliente")];
    expect(buildContactWhere("w1", rules, "all", now)).toEqual({
      workspaceSlug: "w1",
      AND: [
        { name: { contains: "ana", mode: "insensitive" } },
        { stage: { equals: "Cliente", mode: "insensitive" } },
      ],
    });
    const any = buildContactWhere("w1", rules, "any", now);
    expect(any).toHaveProperty("OR");
    expect((any as { OR: unknown[] }).OR).toHaveLength(2);
  });

  it("builds tag, presence, in, and date clauses", () => {
    expect(buildContactWhere("w1", [r("tags", "has_tag", "vip")], "all", now)).toMatchObject({
      AND: [{ tags: { has: "vip" } }],
    });
    expect(buildContactWhere("w1", [r("tags", "is_empty")], "all", now)).toMatchObject({
      AND: [{ tags: { isEmpty: true } }],
    });
    expect(buildContactWhere("w1", [r("email", "is_empty")], "all", now)).toMatchObject({
      AND: [{ OR: [{ email: null }, { email: "" }] }],
    });
    expect(buildContactWhere("w1", [r("stage", "in", "Lead, Cliente")], "all", now)).toMatchObject({
      AND: [{ stage: { in: ["Lead", "Cliente"] } }],
    });
    const last = buildContactWhere("w1", [r("createdAt", "in_last_days", "7")], "all", now) as {
      AND: { createdAt: { gte: Date } }[];
    };
    expect(last.AND[0]!.createdAt.gte.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("negates with NOT for not_* operators", () => {
    expect(buildContactWhere("w1", [r("name", "not_contains", "spam")], "all", now)).toMatchObject({
      AND: [{ NOT: { name: { contains: "spam", mode: "insensitive" } } }],
    });
  });
});
