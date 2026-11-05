import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { WorkspaceGuard } from "./workspace.guard";

function guard(state: string, superAdmins: string[] = [], allows = true) {
  const store = { getMembership: async () => ({ role: "Owner" }) };
  const registry = { exists: async () => true };
  const access = { state: async () => ({ state }), allows: async () => allows };
  const config = { get: () => superAdmins };
  return new WorkspaceGuard(store as never, registry as never, access as never, config as never);
}

function ctx(url: string, email = "ana@marca.co") {
  const request = { params: { workspace: "mi-marca" }, user: { userId: "u1", email }, originalUrl: url };
  return { switchToHttp: () => ({ getRequest: () => request }) } as never;
}

describe("WorkspaceGuard con la prueba gratis", () => {
  it("deja pasar a una marca en prueba o activa", async () => {
    await expect(guard("trial").canActivate(ctx("/api/workspaces/mi-marca/contacts"))).resolves.toBe(true);
    await expect(guard("active").canActivate(ctx("/api/workspaces/mi-marca/contacts"))).resolves.toBe(true);
  });

  it("al vencer responde 402 trial_expired en el panel", async () => {
    const err = await guard("expired")
      .canActivate(ctx("/api/workspaces/mi-marca/contacts"))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(402);
    expect((err as HttpException).getResponse()).toMatchObject({ code: "trial_expired" });
  });

  it("al vencer deja abiertos el plan, la facturación y la ficha de la marca", async () => {
    const g = guard("expired");
    await expect(g.canActivate(ctx("/api/workspaces/mi-marca/access"))).resolves.toBe(true);
    await expect(g.canActivate(ctx("/api/workspaces/mi-marca/access/pay"))).resolves.toBe(true);
    await expect(g.canActivate(ctx("/api/workspaces/mi-marca/billing/status"))).resolves.toBe(true);
    await expect(g.canActivate(ctx("/api/workspaces/mi-marca"))).resolves.toBe(true);
  });

  it("el administrador de la plataforma nunca queda fuera", async () => {
    await expect(
      guard("expired", ["admin@nv.co"]).canActivate(ctx("/api/workspaces/mi-marca/contacts", "Admin@nv.co")),
    ).resolves.toBe(true);
  });
});

describe("WorkspaceGuard con el plan Básico", () => {
  it("responde 402 plan_upgrade en Tienda, Cobros, Automatizaciones, Formularios y Embudos", async () => {
    for (const section of ["products", "payments", "automations", "forms", "funnels"]) {
      const err = await guard("active", [], false)
        .canActivate(ctx(`/api/workspaces/mi-marca/${section}`))
        .catch((e: unknown) => e);
      expect((err as HttpException).getStatus()).toBe(402);
      expect((err as HttpException).getResponse()).toMatchObject({ code: "plan_upgrade" });
    }
  });

  it("deja pasar el resto del panel y al administrador de la plataforma", async () => {
    await expect(guard("active", [], false).canActivate(ctx("/api/workspaces/mi-marca/campaigns"))).resolves.toBe(true);
    await expect(
      guard("active", ["admin@nv.tv"], false).canActivate(ctx("/api/workspaces/mi-marca/products", "admin@nv.tv")),
    ).resolves.toBe(true);
  });
});
