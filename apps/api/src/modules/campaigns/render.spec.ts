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

import { spin } from "./render";

describe("spintax and new variables", () => {
  it("picks one option per {a|b} and leaves {{variables}} alone", () => {
    expect(spin("{Hola|Buenas} {{grupo}}", () => 0.9)).toBe("Buenas {{grupo}}");
    expect(spin("{Hola|Buenas} {{grupo}}", () => 0)).toBe("Hola {{grupo}}");
    expect(spin("sin opciones {solo}")).toBe("sin opciones {solo}");
  });

  it("knows the day and greeting in the brand's time zone", () => {
    // 2026-11-05 13:00 UTC = jueves 9:00 a. m. en Caracas
    const v = builtinVars("G", { timeZone: "America/Caracas", brandName: "Aurora", now: new Date("2026-11-05T13:00:00Z") });
    expect(v.dia).toBe("jueves");
    expect(v.saludo).toBe("buenos días");
    expect(v.nombre_marca).toBe("Aurora");
    const n = builtinVars("G", { timeZone: "America/Caracas", now: new Date("2026-11-06T02:00:00Z") });
    expect(n.saludo).toBe("buenas noches");
  });
});
