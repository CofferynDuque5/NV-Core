import { describe, expect, it } from "vitest";

import { builtinVars, renderTemplate } from "./render";

describe("renderTemplate", () => {
  it("replaces {{key}} with the matching value", () => {
    expect(renderTemplate("Hola {{grupo}} 👋", { grupo: "Ventas" })).toBe("Hola Ventas 👋");
  });
  it("supports several variables and repeats", () => {
    expect(renderTemplate("{{a}}-{{b}}-{{a}}", { a: "1", b: "2" })).toBe("1-2-1");
  });
  it("replaces unknown variables with empty string", () => {
    expect(renderTemplate("Hola {{nombre}}!", {})).toBe("Hola !");
  });
  it("tolerates spaces inside the braces", () => {
    expect(renderTemplate("{{ grupo }}", { grupo: "X" })).toBe("X");
  });
});

describe("builtinVars", () => {
  it("always provides grupo, fecha and hora", () => {
    const v = builtinVars("Mi grupo");
    expect(v.grupo).toBe("Mi grupo");
    expect(typeof v.fecha).toBe("string");
    expect(typeof v.hora).toBe("string");
  });
});
