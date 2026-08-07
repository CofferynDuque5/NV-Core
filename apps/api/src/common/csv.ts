/**
 * Minimal RFC-4180 CSV serialize/parse (no dependency). Handles quoted fields,
 * embedded commas / quotes / newlines, a UTF-8 BOM, and CRLF or LF line endings.
 * Used by data import/export (contacts today).
 */

function escapeField(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows to CSV using the given column order. First line is the header. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(escapeField).join(",");
  const body = rows.map((r) => columns.map((c) => escapeField(r[c])).join(",")).join("\r\n");
  return body ? `${header}\r\n${body}` : header;
}

/**
 * Parse CSV text into an array of objects keyed by the (trimmed) header row.
 * Blank lines are skipped; missing trailing fields become "".
 */
export function parseCsv(text: string): Record<string, string>[] {
  const t = text.replace(/^\uFEFF/, ""); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore; a following \n ends the row (handles CRLF; lone CR is rare)
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const header = rows[0]!.map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").trim();
      });
      return obj;
    });
}
