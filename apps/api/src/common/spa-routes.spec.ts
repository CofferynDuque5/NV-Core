import { describe, expect, it } from "vitest";

import { isSpaRoute } from "./spa-routes";

describe("isSpaRoute", () => {
  it("knows the panel's pages", () => {
    for (const p of [
      "/",
      "/login",
      "/register/",
      "/join/abc",
      "/f/contacto",
      "/w/nv/inbox",
      "/w/nv",
      "/admin",
    ]) {
      expect(isSpaRoute(p), p).toBe(true);
    }
  });
  it("rejects unknown paths", () => {
    for (const p of [
      "/ruta-que-no-existe-qa",
      "/w/nv/nada",
      "/w/nv/inbox/x",
      "/login/x",
      "/join",
    ]) {
      expect(isSpaRoute(p), p).toBe(false);
    }
  });
});
