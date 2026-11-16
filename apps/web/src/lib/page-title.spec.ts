import { describe, expect, it } from "vitest";

import { pageTitle } from "./page-title";

describe("pageTitle", () => {
  it("names each kind of page", () => {
    expect(pageTitle("/")).toBe("NV Marketing — Panel de ventas");
    expect(pageTitle("/login")).toBe("Ingresar · NV Marketing");
    expect(pageTitle("/register/")).toBe("Crear cuenta · NV Marketing");
    expect(pageTitle("/join/abc")).toBe("Unirte a una marca · NV Marketing");
    expect(pageTitle("/f/promo")).toBe("NV Marketing");
    expect(pageTitle("/w/nv-demo/contactos")).toBe("Contactos · NV Marketing");
    expect(pageTitle("/w/nv-demo/dashboard")).toBe("Inicio · NV Marketing");
    expect(pageTitle("/w/nv-demo")).toBe("Inicio · NV Marketing");
    expect(pageTitle("/w/nv-demo/plan")).toBe("Mi plan · NV Marketing");
    expect(pageTitle("/w/nv-demo/analytics")).toBe("Analítica · NV Marketing");
  });

  it("calls unknown paths what they are", () => {
    expect(pageTitle("/ruta-que-no-existe")).toBe("Página no encontrada · NV Marketing");
    expect(pageTitle("/w/nv-demo/nada")).toBe("Página no encontrada · NV Marketing");
  });
});
