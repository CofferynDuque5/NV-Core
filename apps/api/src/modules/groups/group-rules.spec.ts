import { describe, expect, it } from "vitest";

import { groupRulesFromSync } from "../whatsapp/whatsapp.service";
import { cleanPrices } from "../campaigns/campaigns.module";
import { normalizeLink } from "../brand/brand.module";

describe("groupRulesFromSync", () => {
  it("guarda descripción, creador y solo-admins, y enciende los requisitos encontrados", () => {
    const r = groupRulesFromSync({
      remoteJid: "1@g.us",
      subject: "Ventas",
      size: 10,
      description: "Reglas: publicar con precio y con foto.",
      onlyAdmins: false,
      ownerJid: "584121234567@s.whatsapp.net",
    });
    expect(r.always).toMatchObject({ description: "Reglas: publicar con precio y con foto.", ownerJid: "584121234567@s.whatsapp.net", onlyAdmins: false });
    expect(r.whenFound).toEqual({ requiresPrice: true, requiresImage: true });
  });

  it("nunca apaga un requisito puesto a mano (no aparece si no se encontró)", () => {
    const r = groupRulesFromSync({ remoteJid: "1@g.us", subject: "X", size: 1, description: "" });
    expect(r.whenFound).toEqual({});
    expect(r.always.description).toBeNull();
  });
});

describe("cleanPrices", () => {
  it("solo monedas conocidas, sin vacíos", () => {
    expect(cleanPrices({ VES: " 350 ", COP: "", XXX: "1", EUR: 9 as unknown as string })).toEqual({ VES: "350", EUR: "9" });
    expect(cleanPrices(undefined)).toBeUndefined();
  });
});

describe("normalizeLink", () => {
  it("agrega https a dominios y deja @usuarios como están", () => {
    expect(normalizeLink("instagram.com/tienda")).toBe("https://instagram.com/tienda");
    expect(normalizeLink("https://tienda.com")).toBe("https://tienda.com");
    expect(normalizeLink("@tienda")).toBe("@tienda");
  });
});
