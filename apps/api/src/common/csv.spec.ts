import { describe, expect, it } from "vitest";

import { parseCsv, toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header + rows in column order", () => {
    const csv = toCsv([{ name: "Ana", stage: "Lead" }], ["name", "stage"]);
    expect(csv).toBe("name,stage\r\nAna,Lead");
  });

  it("neutralizes CSV formula injection (leading = + - @) by prefixing a quote", () => {
    const csv = toCsv(
      [{ a: "=1+2", b: "+CMD", c: "-2", d: "@SUM(A1)", e: "safe" }],
      ["a", "b", "c", "d", "e"],
    );
    // Each formula-leading field is prefixed with ' so a spreadsheet reads it as text.
    // The '=1+2' has no special CSV chars so it's not quoted, just prefixed.
    expect(csv).toBe("a,b,c,d,e\r\n'=1+2,'+CMD,'-2,'@SUM(A1),safe");
  });

  it("neutralized formula still round-trips (prefix is literal data)", () => {
    const parsed = parseCsv(toCsv([{ name: "=1+2" }], ["name"]));
    expect(parsed).toEqual([{ name: "'=1+2" }]);
  });

  it("quotes fields with commas, quotes or newlines", () => {
    const csv = toCsv([{ a: "x,y", b: 'he said "hi"', c: "line1\nline2" }], ["a", "b", "c"]);
    expect(csv).toBe('a,b,c\r\n"x,y","he said ""hi""","line1\nline2"');
  });

  it("renders null/undefined as empty and header-only when no rows", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b");
    expect(toCsv([{ a: null, b: undefined }], ["a", "b"])).toBe("a,b\r\n,");
  });
});

describe("parseCsv", () => {
  it("parses a simple table keyed by the header", () => {
    expect(parseCsv("name,stage\nAna,Lead\nBob,Cliente")).toEqual([
      { name: "Ana", stage: "Lead" },
      { name: "Bob", stage: "Cliente" },
    ]);
  });

  it("handles quoted commas, escaped quotes, CRLF and a BOM", () => {
    const csv = '﻿name,note\r\n"Doe, Jane","said ""hi"""\r\n';
    expect(parseCsv(csv)).toEqual([{ name: "Doe, Jane", note: 'said "hi"' }]);
  });

  it("round-trips with toCsv", () => {
    const rows = [
      { name: "Ana", tags: "vip;lead", note: "a, b\nc" },
      { name: "Bob", tags: "", note: 'x"y' },
    ];
    expect(parseCsv(toCsv(rows, ["name", "tags", "note"]))).toEqual(rows);
  });

  it("skips blank lines and trims header/values", () => {
    expect(parseCsv(" name , email \nAna, ana@x.com \n\n")).toEqual([
      { name: "Ana", email: "ana@x.com" },
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
