import assert from "node:assert/strict";
import { test } from "node:test";

import { extractVars, renderTemplate } from "../src/render.js";

test("renderTemplate replaces known vars and blanks unknown", () => {
  assert.equal(
    renderTemplate("Hola {{grupo}}, hoy {{fecha}} · {{falta}}", { grupo: "VIP", fecha: "01/01" }),
    "Hola VIP, hoy 01/01 · ",
  );
});

test("renderTemplate tolerates spaces and dashes in keys", () => {
  assert.equal(renderTemplate("{{ ciudad }}-{{cod-postal}}", { ciudad: "Caracas", "cod-postal": "1010" }), "Caracas-1010");
});

test("extractVars lists unique variable names", () => {
  assert.deepEqual(extractVars("{{a}} {{b}} {{a}}"), ["a", "b"]);
});

test("auth signing round-trips and rejects tampering", async () => {
  const { login, verifyToken } = await import("../src/auth.js");
  const token = login("admin", "admin");
  assert.ok(token);
  assert.equal(verifyToken(token)?.u, "admin");
  assert.equal(verifyToken(token + "x"), null);
  assert.equal(login("admin", "wrong"), null);
});
