import { CONTACT_STAGES } from "../enums";
import type { SegmentField, SegmentOperator } from "../enums";

/**
 * Data-driven catalog for the segment rule builder. Both the backend validator
 * and the web rule-builder derive their behavior from these tables, so the set
 * of allowed field/operator combinations lives in exactly one place.
 */

/** The value shape a field expects, which drives the UI input + validation. */
export type SegmentFieldType = "text" | "tags" | "enum" | "date";

export interface SegmentFieldSpec {
  field: SegmentField;
  label: string;
  type: SegmentFieldType;
  /** Allowed values, for enum fields (e.g. contact stage). */
  options?: readonly string[];
}

export const SEGMENT_FIELD_CATALOG: readonly SegmentFieldSpec[] = [
  { field: "name", label: "Nombre", type: "text" },
  { field: "email", label: "Correo", type: "text" },
  { field: "phone", label: "Teléfono", type: "text" },
  { field: "company", label: "Empresa", type: "text" },
  { field: "tags", label: "Etiquetas", type: "tags" },
  { field: "stage", label: "Etapa", type: "enum", options: CONTACT_STAGES },
  { field: "createdAt", label: "Fecha de alta", type: "date" },
  { field: "lastContactAt", label: "Último contacto", type: "date" },
] as const;

export interface SegmentOperatorSpec {
  op: SegmentOperator;
  label: string;
  /** Field types this operator applies to. */
  types: readonly SegmentFieldType[];
  /** True when the operator ignores `value` (e.g. is_set / is_empty). */
  valueless?: boolean;
  /** Hint for the value input rendered by the UI. */
  valueHint?: "text" | "number" | "date" | "stage" | "csv";
}

export const SEGMENT_OPERATOR_CATALOG: readonly SegmentOperatorSpec[] = [
  { op: "equals", label: "es igual a", types: ["text", "enum"], valueHint: "text" },
  { op: "not_equals", label: "no es igual a", types: ["text", "enum"], valueHint: "text" },
  { op: "contains", label: "contiene", types: ["text"], valueHint: "text" },
  { op: "not_contains", label: "no contiene", types: ["text"], valueHint: "text" },
  { op: "is_set", label: "tiene valor", types: ["text", "tags", "date"], valueless: true },
  { op: "is_empty", label: "está vacío", types: ["text", "tags", "date"], valueless: true },
  { op: "in", label: "es uno de", types: ["enum"], valueHint: "csv" },
  { op: "has_tag", label: "incluye la etiqueta", types: ["tags"], valueHint: "text" },
  { op: "not_has_tag", label: "no incluye la etiqueta", types: ["tags"], valueHint: "text" },
  { op: "before", label: "es anterior a", types: ["date"], valueHint: "date" },
  { op: "after", label: "es posterior a", types: ["date"], valueHint: "date" },
  {
    op: "in_last_days",
    label: "en los últimos (días)",
    types: ["date"],
    valueHint: "number",
  },
  {
    op: "not_in_last_days",
    label: "no en los últimos (días)",
    types: ["date"],
    valueHint: "number",
  },
] as const;

/** The spec for a field, or undefined if the field id is unknown. */
export function segmentFieldSpec(field: string): SegmentFieldSpec | undefined {
  return SEGMENT_FIELD_CATALOG.find((f) => f.field === field);
}

/** The spec for an operator, or undefined if the operator id is unknown. */
export function segmentOperatorSpec(op: string): SegmentOperatorSpec | undefined {
  return SEGMENT_OPERATOR_CATALOG.find((o) => o.op === op);
}

/** Operators valid for a given field, in catalog order. */
export function operatorsForField(field: string): SegmentOperatorSpec[] {
  const spec = segmentFieldSpec(field);
  if (!spec) return [];
  return SEGMENT_OPERATOR_CATALOG.filter((o) => o.types.includes(spec.type));
}
