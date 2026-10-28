import { describe, expect, it } from "vitest";
import {
  analyzeGroupRules,
  campaignFooter,
  countryFromJid,
  detectGroupCountry,
  groupPostingProblems,
  priceForGroup,
  withFooter,
} from "@nv/domain";

describe("país del grupo", () => {
  it("lo saca del nombre (ciudad o país, sin tildes)", () => {
    expect(detectGroupCountry({ name: "Ventas Caracas 🛍️" })).toEqual({ country: "VE", source: "nombre" });
    expect(detectGroupCountry({ name: "Emprendedores Bogotá" }).country).toBe("CO");
    expect(detectGroupCountry({ name: "Compraventa Madrid" }).country).toBe("ES");
  });

  it("si no, del número del creador en el id del grupo", () => {
    expect(countryFromJid("584121234567-1612345678@g.us")).toBe("VE");
    expect(countryFromJid("573001234567-1612345678@g.us")).toBe("CO");
    expect(countryFromJid("120363025246125486@g.us")).toBeNull();
    expect(detectGroupCountry({ name: "Ofertas", ownerJid: "34612345678@s.whatsapp.net" })).toEqual({
      country: "ES",
      source: "creador",
    });
  });

  it("lo que eligió el usuario manda, y sin pistas no adivina", () => {
    expect(detectGroupCountry({ name: "Ventas Caracas", country: "CO" })).toEqual({ country: "CO", source: "manual" });
    expect(detectGroupCountry({ name: "Ofertas del día" })).toEqual({ country: null, source: null });
    expect(detectGroupCountry({ name: "Ventas Barcelona" }).country).toBeNull();
  });
});

describe("precio por moneda del grupo", () => {
  const prices = { VES: "350", COP: "40.000", EUR: "9" };
  it("Venezuela en Bs, Colombia en pesos, España en euros", () => {
    expect(priceForGroup({ name: "Ventas Caracas" }, prices)).toBe("Bs 350");
    expect(priceForGroup({ name: "Ventas Medellín" }, prices)).toBe("$ 40.000 COP");
    expect(priceForGroup({ name: "Ventas Madrid" }, prices)).toBe("9 €");
    expect(priceForGroup({ name: "Ventas Lima" }, prices)).toBe("");
  });
});

describe("reglas del grupo", () => {
  it("detecta prohibiciones y requisitos en la descripción", () => {
    const r = analyzeGroupRules("REGLAS: 1) Toda publicación debe incluir el precio. 2) Con foto real del producto. 3) Solo los viernes.");
    expect(r.requiresPrice).toBe(true);
    expect(r.requiresImage).toBe(true);
    expect(r.forbidsAds).toBe(false);
    expect(r.scheduleNote).toMatch(/viernes/);
    expect(analyzeGroupRules("Grupo de la familia. Prohibida la publicidad 🚫").forbidsAds).toBe(true);
    expect(analyzeGroupRules("No se permite spam ni ventas").forbidsAds).toBe(true);
  });

  it("solo admins se informa aunque no haya texto", () => {
    expect(analyzeGroupRules("", true).notes).toEqual(["Solo los administradores pueden escribir en este grupo."]);
    expect(analyzeGroupRules("").notes).toEqual(["El grupo no tiene reglas escritas en su descripción."]);
  });
});

describe("groupPostingProblems", () => {
  it("apartados y grupos que no son de venta nunca reciben campañas", () => {
    expect(groupPostingProblems({ name: "X", excluded: true }, { hasImage: true })).toEqual([
      "Apartado: nunca se publica aquí.",
    ]);
    expect(groupPostingProblems({ name: "Uni", category: "universidad" }, { hasImage: true })[0]).toMatch(/Universidad/);
  });

  it("exige precio en la moneda del grupo y foto cuando el grupo lo pide", () => {
    const g = { name: "Ventas Caracas", requiresPrice: true, requiresImage: true };
    expect(groupPostingProblems(g, { hasImage: false, prices: { COP: "1" } })).toEqual([
      "Exige publicar con foto y la campaña no tiene imagen.",
      "Exige precio y la campaña no tiene precio en Bolívares (Bs).",
    ]);
    expect(groupPostingProblems(g, { hasImage: true, prices: { VES: "350" } })).toEqual([]);
    expect(groupPostingProblems({ name: "Ofertas", requiresPrice: true }, { hasImage: true })[0]).toMatch(/país del grupo/);
  });
});

describe("pie de los mensajes", () => {
  it("redes, luego web, luego NV Marketing", () => {
    const footer = campaignFooter({
      socialLinks: [{ label: "Instagram", url: "https://instagram.com/tienda" }, { label: "", url: " " }],
      website: "https://tienda.com",
    });
    expect(footer).toBe(
      "Instagram: https://instagram.com/tienda\nWeb: https://tienda.com\nMensaje enviado con NV Marketing https://nvmarketing.nvcorx.com/",
    );
    expect(withFooter("Hola  \n", "Pie")).toBe("Hola\n\nPie");
  });
});

describe("{{precio}} without a price", () => {
  it("skips a group whose currency has no price when the message uses {{precio}}", async () => {
    const { groupPostingProblems, usesPriceVar } = await import("@nv/domain");
    const madrid = { name: "Emprendedores Madrid" };
    expect(usesPriceVar("Combo a {{ precio }}")).toBe(true);
    expect(groupPostingProblems(madrid, { hasImage: false, prices: { VES: "350" }, usesPrice: true })[0]).toBe(
      "El mensaje usa {{precio}} y la campaña no tiene precio en Euros (€).",
    );
    expect(groupPostingProblems(madrid, { hasImage: false, prices: { EUR: "6" }, usesPrice: true })).toEqual([]);
    expect(groupPostingProblems(madrid, { hasImage: false, prices: {}, usesPrice: false })).toEqual([]);
  });
});
