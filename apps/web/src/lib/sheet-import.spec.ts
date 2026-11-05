import { describe, expect, it } from "vitest";

import { guessField, guessMapping, parseDelimited, toImportCsv } from "./sheet-import";

describe("sheet import", () => {
  it("guesses Spanish and English headers", () => {
    expect(guessField("Nombre completo")).toBe("name");
    expect(guessField("Teléfono")).toBe("phone");
    expect(guessField("Celular / WhatsApp")).toBe("phone");
    expect(guessField("Correo")).toBe("email");
    expect(guessField("Notas")).toBe("");
    expect(guessMapping(["Nombre", "Teléfono", "Celular", "Correo"])).toEqual(["name", "phone", "", "email"]);
  });
  it("parses comma, semicolon and quoted cells", () => {
    expect(parseDelimited('nombre;telefono\n"Pérez; Ana";+58 412\n\n')).toEqual([
      ["nombre", "telefono"],
      ["Pérez; Ana", "+58 412"],
    ]);
    expect(parseDelimited('a,b\r\n"x ""y""",2')).toEqual([
      ["a", "b"],
      ['x "y"', "2"],
    ]);
  });
  it("builds the import CSV from the chosen columns", () => {
    const csv = toImportCsv(
      [
        ["Ana, la de Caracas", "584121110000", "x"],
        ["", "", ""],
      ],
      ["name", "phone", ""],
    );
    expect(csv).toBe('name,phone,email,company,tags,stage\n"Ana, la de Caracas",584121110000,,,,');
  });
});
