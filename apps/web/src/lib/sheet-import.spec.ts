import { describe, expect, it } from "vitest";

import { excelDate, guessField, guessMapping, parseDelimited, toImportCsv } from "./sheet-import";

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
    expect(csv).toBe('name,phone,email,company,tags,stage,birthday\n"Ana, la de Caracas",584121110000,,,,,');
  });
  it("reads birthdays, also Excel date numbers", () => {
    expect(guessField("Fecha de nacimiento")).toBe("birthday");
    expect(excelDate("32947")).toBe("15/03/1990");
    expect(excelDate("15/03")).toBe("15/03");
    const csv = toImportCsv([["Ana", "32947"]], ["name", "birthday"]);
    expect(csv.split("\n")[1]).toBe("Ana,,,,,,15/03/1990");
  });
});
