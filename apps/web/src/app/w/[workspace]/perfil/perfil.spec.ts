import { describe, expect, it } from "vitest";

import { passwordProblems } from "./page";

describe("passwordProblems", () => {
  it("pide 8 caracteres como mínimo", () => {
    expect(passwordProblems("corta", "corta", "vieja")).toEqual(["Mínimo 8 caracteres."]);
  });

  it("avisa si repite la actual o si la confirmación no coincide", () => {
    expect(passwordProblems("misma-clave", "otra-cosa", "misma-clave")).toEqual([
      "Debe ser distinta de la actual.",
      "Las dos contraseñas no coinciden.",
    ]);
  });

  it("sin problemas cuando todo cuadra", () => {
    expect(passwordProblems("nueva-clave-9", "nueva-clave-9", "vieja-clave-1")).toEqual([]);
  });
});
