import { Prisma } from "@prisma/client";
import {
  segmentFieldSpec,
  segmentOperatorSpec,
  type SegmentMatch,
  type SegmentRule,
} from "@nv/domain";

/**
 * Translates a segment's rules into a Prisma `where` filter over Contact, so
 * evaluation (count + preview) runs in the database and scales with the tenant.
 * This is the single source of truth for what a segment "means".
 */

/** Human-readable validation error for a rule, or null when it's valid. */
export function ruleError(rule: SegmentRule): string | null {
  const field = segmentFieldSpec(rule.field);
  if (!field) return `Campo desconocido: "${rule.field}".`;
  const op = segmentOperatorSpec(rule.operator);
  if (!op) return `Operador desconocido: "${rule.operator}".`;
  if (!op.types.includes(field.type)) {
    return `El operador "${op.label}" no aplica al campo "${field.label}".`;
  }
  if (!op.valueless) {
    if (rule.value == null || String(rule.value).trim() === "") {
      return `El campo "${field.label}" requiere un valor.`;
    }
    if (op.valueHint === "number" && !Number.isFinite(Number(rule.value))) {
      return `"${field.label}" espera un número de días.`;
    }
    if (op.valueHint === "date" && Number.isNaN(Date.parse(rule.value))) {
      return `"${field.label}" espera una fecha válida.`;
    }
    if (field.type === "enum" && field.options && op.op !== "in") {
      // single-value enum ops must use an allowed option
      if (!field.options.includes(rule.value)) {
        return `"${rule.value}" no es un valor válido para "${field.label}".`;
      }
    }
  }
  return null;
}

/** Validate a whole rule set; returns the first error or null. */
export function rulesError(rules: SegmentRule[]): string | null {
  for (const r of rules) {
    const e = ruleError(r);
    if (e) return e;
  }
  return null;
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Prisma clause for a single (assumed valid) rule. */
function clauseFor(rule: SegmentRule, now: Date): Prisma.ContactWhereInput {
  const { field, operator, value } = rule;
  const text = () => value.trim();
  switch (operator) {
    case "equals":
      return { [field]: { equals: text(), mode: "insensitive" } };
    case "not_equals":
      return { NOT: { [field]: { equals: text(), mode: "insensitive" } } };
    case "contains":
      return { [field]: { contains: text(), mode: "insensitive" } };
    case "not_contains":
      return { NOT: { [field]: { contains: text(), mode: "insensitive" } } };
    case "is_set":
      if (field === "tags") return { NOT: { tags: { isEmpty: true } } };
      return { AND: [{ [field]: { not: null } }, { NOT: { [field]: "" } }] };
    case "is_empty":
      if (field === "tags") return { tags: { isEmpty: true } };
      return { OR: [{ [field]: null }, { [field]: "" }] };
    case "in": {
      const opts = text()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return { [field]: { in: opts } };
    }
    case "has_tag":
      return { tags: { has: text() } };
    case "not_has_tag":
      return { NOT: { tags: { has: text() } } };
    case "before":
      return { [field]: { lt: new Date(value) } };
    case "after":
      return { [field]: { gt: new Date(value) } };
    case "in_last_days":
      return { [field]: { gte: daysAgo(now, Number(value)) } };
    case "not_in_last_days":
      return { OR: [{ [field]: null }, { [field]: { lt: daysAgo(now, Number(value)) } }] };
    default:
      return {};
  }
}

/**
 * Build a Contact `where` from a rule set. Invalid rules are skipped (call
 * {@link rulesError} first to reject them at the API boundary). An empty rule
 * set matches nothing — a segment with no rules has no audience.
 */
export function buildContactWhere(
  workspaceSlug: string,
  rules: SegmentRule[],
  match: SegmentMatch = "all",
  now: Date = new Date(),
): Prisma.ContactWhereInput {
  const valid = rules.filter((r) => !ruleError(r));
  if (valid.length === 0) {
    // No usable rules → match nothing (guard against an accidental full-table match).
    return { workspaceSlug, id: "__none__" };
  }
  const clauses = valid.map((r) => clauseFor(r, now));
  const combined: Prisma.ContactWhereInput = match === "any" ? { OR: clauses } : { AND: clauses };
  return { workspaceSlug, ...combined };
}
