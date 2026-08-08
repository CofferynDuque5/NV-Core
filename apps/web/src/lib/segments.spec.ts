import { describe, expect, it } from "vitest";
import type { SegmentRule } from "@nv/domain";

import {
  defaultRule,
  isValueless,
  reconcileRule,
  ruleLabel,
  ruleValid,
  valueControl,
} from "./segments";

describe("segment rule helpers", () => {
  it("isValueless flags presence operators", () => {
    expect(isValueless("is_set")).toBe(true);
    expect(isValueless("is_empty")).toBe(true);
    expect(isValueless("contains")).toBe(false);
  });

  it("valueControl maps operators to input controls", () => {
    expect(valueControl("is_set")).toBe("none");
    expect(valueControl("in_last_days")).toBe("number");
    expect(valueControl("before")).toBe("date");
    expect(valueControl("in")).toBe("csv");
    expect(valueControl("contains")).toBe("text");
  });

  it("defaultRule picks the first valid operator for the field", () => {
    expect(defaultRule("stage")).toEqual({ field: "stage", operator: "equals", value: "" });
    expect(defaultRule("createdAt").operator).toBe("is_set"); // first date op in catalog? check validity
  });

  it("reconcileRule keeps a valid operator, else resets", () => {
    // switching name(text)->tags keeps nothing (contains invalid for tags)
    const r: SegmentRule = { field: "name", operator: "contains", value: "x" };
    const moved = reconcileRule(r, "tags");
    expect(moved.field).toBe("tags");
    expect(["is_set", "is_empty", "has_tag", "not_has_tag"]).toContain(moved.operator);
    // switching between two text fields keeps the operator + value
    const kept = reconcileRule(r, "email");
    expect(kept).toEqual({ field: "email", operator: "contains", value: "x" });
    // switching to a valueless operator clears the value
    const cleared = reconcileRule({ field: "email", operator: "is_set", value: "x" }, "phone");
    expect(cleared.value).toBe("");
  });

  it("ruleValid mirrors backend validity", () => {
    expect(ruleValid({ field: "name", operator: "contains", value: "ana" })).toBe(true);
    expect(ruleValid({ field: "name", operator: "contains", value: "  " })).toBe(false);
    expect(ruleValid({ field: "email", operator: "is_set", value: "" })).toBe(true);
    expect(ruleValid({ field: "name", operator: "has_tag", value: "x" } as SegmentRule)).toBe(false);
  });

  it("ruleLabel renders a readable chip", () => {
    expect(ruleLabel({ field: "stage", operator: "equals", value: "Cliente" })).toBe(
      "Etapa es igual a Cliente",
    );
    expect(ruleLabel({ field: "email", operator: "is_set", value: "" })).toBe("Correo tiene valor");
  });
});
