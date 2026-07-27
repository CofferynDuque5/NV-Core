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

test("auth: seed + login round-trips, rejects tampering and bad creds", async () => {
  process.env.NSAP_DATA_DIR = `/tmp/nsap-test-${process.pid}`;
  process.env.NSAP_USERNAME = "admin";
  process.env.NSAP_PASSWORD = "admin";
  const { seedAdmin, login, verifyToken } = await import("../src/auth.js");
  seedAdmin();
  const result = login("admin", "admin");
  assert.ok(result?.token);
  assert.equal(verifyToken(result.token)?.role, "admin");
  assert.equal(verifyToken(result.token + "x"), null);
  assert.equal(login("admin", "wrong"), null);
});

test("hashPassword produces a salted, verifiable hash", async () => {
  const { hashPassword } = await import("../src/auth.js");
  const a = hashPassword("secret");
  const b = hashPassword("secret");
  assert.notEqual(a.salt, b.salt); // sal aleatoria
  assert.notEqual(a.hash, b.hash);
});
