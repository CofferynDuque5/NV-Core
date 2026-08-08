import {
  SEGMENT_FIELD_CATALOG,
  operatorsForField,
  segmentFieldSpec,
  segmentOperatorSpec,
  type SegmentField,
  type SegmentOperator,
  type SegmentRule,
} from "@nv/domain";

/**
 * Pure helpers for the segment rule builder. All behavior is derived from the
 * shared domain catalog so the UI and the backend validator never drift.
 */

export { SEGMENT_FIELD_CATALOG, operatorsForField, segmentFieldSpec, segmentOperatorSpec };

/** True when an operator ignores its value (is_set / is_empty). */
export function isValueless(op: string): boolean {
  return segmentOperatorSpec(op)?.valueless ?? false;
}

/** The HTML input type / control the value field should render. */
export function valueControl(op: string): "none" | "text" | "number" | "date" | "stage" | "csv" {
  const spec = segmentOperatorSpec(op);
  if (!spec) return "text";
  if (spec.valueless) return "none";
  return spec.valueHint ?? "text";
}

/** A sensible default rule for a freshly added row. */
export function defaultRule(field: SegmentField = "stage"): SegmentRule {
  const ops = operatorsForField(field);
  const operator = (ops[0]?.op ?? "equals") as SegmentOperator;
  return { field, operator, value: "" };
}

/**
 * When the field changes, keep the operator only if it's still valid for the
 * new field type; otherwise fall back to the field's first operator.
 */
export function reconcileRule(rule: SegmentRule, field: SegmentField): SegmentRule {
  const ops = operatorsForField(field);
  const stillValid = ops.some((o) => o.op === rule.operator);
  const operator = (stillValid ? rule.operator : ops[0]?.op ?? "equals") as SegmentOperator;
  return { field, operator, value: isValueless(operator) ? "" : rule.value };
}

/** Client-side validity of a single rule (mirrors the backend's ruleError). */
export function ruleValid(rule: SegmentRule): boolean {
  const field = segmentFieldSpec(rule.field);
  const op = segmentOperatorSpec(rule.operator);
  if (!field || !op) return false;
  if (!op.types.includes(field.type)) return false;
  if (op.valueless) return true;
  return rule.value.trim().length > 0;
}

/** A short human label for a rule chip, e.g. "Etapa es igual a Cliente". */
export function ruleLabel(rule: SegmentRule): string {
  const field = segmentFieldSpec(rule.field)?.label ?? rule.field;
  const op = segmentOperatorSpec(rule.operator)?.label ?? rule.operator;
  if (isValueless(rule.operator)) return `${field} ${op}`;
  return `${field} ${op} ${rule.value}`.trim();
}
