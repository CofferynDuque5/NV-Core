/**
 * Read a contacts spreadsheet in the browser (CSV or Excel .xlsx) and map its
 * columns to contact fields. No library: .xlsx is a zip of XML files, read
 * with the browser's own DecompressionStream and DOMParser.
 */

export type ContactField = "name" | "phone" | "email" | "company" | "tags" | "stage" | "";

export const CONTACT_FIELDS: { id: Exclude<ContactField, "">; label: string }[] = [
  { id: "name", label: "Nombre" },
  { id: "phone", label: "Teléfono" },
  { id: "email", label: "Correo" },
  { id: "company", label: "Empresa" },
  { id: "tags", label: "Etiquetas" },
  { id: "stage", label: "Etapa" },
];

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const GUESS: [Exclude<ContactField, "">, string[]][] = [
  ["name", ["name", "nombre", "nombres", "nombrecompleto", "cliente", "contacto", "fullname"]],
  ["phone", ["phone", "telefono", "tel", "celular", "movil", "whatsapp", "numero", "mobile"]],
  ["email", ["email", "correo", "mail", "correoelectronico"]],
  ["company", ["company", "empresa", "negocio", "compania"]],
  ["tags", ["tags", "etiquetas", "etiqueta", "grupo", "categoria"]],
  ["stage", ["stage", "etapa", "estado"]],
];

/** Best guess of which field a column header is («Teléfono» → phone). */
export function guessField(header: string): ContactField {
  const h = fold(header);
  if (!h) return "";
  for (const [field, keys] of GUESS) if (keys.includes(h)) return field;
  for (const [field, keys] of GUESS) if (keys.some((k) => k.length > 3 && h.includes(k))) return field;
  return "";
}

/** Guess every column; a field is used by one column at most (the first). */
export function guessMapping(headers: string[]): ContactField[] {
  const used = new Set<ContactField>();
  return headers.map((h) => {
    const f = guessField(h);
    if (!f || used.has(f)) return "";
    used.add(f);
    return f;
  });
}

/** Parse CSV text (comma, semicolon or tab, detected from the first line). */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Rows → the CSV the import endpoint reads (name,phone,email,company,tags,stage). */
export function toImportCsv(rows: string[][], mapping: ContactField[]): string {
  const fields = CONTACT_FIELDS.map((f) => f.id);
  const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [fields.join(",")];
  for (const r of rows) {
    const out = fields.map((f) => {
      const i = mapping.indexOf(f);
      return i >= 0 ? (r[i] ?? "").trim() : "";
    });
    if (out.every((v) => !v)) continue;
    lines.push(out.map(q).join(","));
  }
  return lines.join("\n");
}

/** A cell number like 5.84121110000E+11 (Excel phone) back to plain digits. */
function plainNumber(v: string): string {
  if (/^-?\d+(\.\d+)?E[+-]?\d+$/i.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n) && Math.abs(n) < 1e21) return BigInt(Math.round(n)).toString();
  }
  return v;
}

/** Column index of a cell reference («C12» → 2). */
function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function unzipEntries(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  // End of central directory: last occurrence of 0x06054b50.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("El archivo no es un Excel válido (.xlsx).");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtra = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtra;
    const raw = bytes.slice(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      out.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
  }
  return out;
}

/** First sheet of an .xlsx file as rows of text. */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const files = await unzipEntries(buf);
  const dec = new TextDecoder();
  const xml = (name: string) => {
    const f = files.get(name);
    return f ? new DOMParser().parseFromString(dec.decode(f), "application/xml") : null;
  };
  const shared: string[] = [];
  const ss = xml("xl/sharedStrings.xml");
  if (ss) for (const si of Array.from(ss.getElementsByTagName("si"))) {
    shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  }
  // The first sheet in the workbook's order.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = xml("xl/workbook.xml");
  const rels = xml("xl/_rels/workbook.xml.rels");
  const first = wb?.getElementsByTagName("sheet")[0];
  const rid = first?.getAttribute("r:id") ?? first?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  if (rid && rels) {
    const rel = Array.from(rels.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = xml(sheetPath) ?? xml([...files.keys()].find((k) => k.startsWith("xl/worksheets/")) ?? "");
  if (!sheet) throw new Error("No encontramos ninguna hoja en el Excel.");
  const rows: string[][] = [];
  for (const row of Array.from(sheet.getElementsByTagName("row"))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r");
      const i = ref ? colIndex(ref) : cells.length;
      const t = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      let text = "";
      if (t === "s") text = shared[Number(v)] ?? "";
      else if (t === "inlineStr") text = Array.from(c.getElementsByTagName("t")).map((x) => x.textContent ?? "").join("");
      else text = plainNumber(v);
      while (cells.length < i) cells.push("");
      cells[i] = text;
    }
    if (cells.some((x) => x.trim())) rows.push(cells);
  }
  return rows;
}

/** CSV or Excel file → rows (first row = headers). */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) throw new Error("Ese es el Excel antiguo (.xls): guárdalo como .xlsx o CSV y vuelve a intentarlo.");
  if (name.endsWith(".xlsx")) return readXlsx(await file.arrayBuffer());
  return parseDelimited(await file.text());
}
