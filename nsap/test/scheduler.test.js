import assert from "node:assert/strict";
import { test } from "node:test";

import { isDue } from "../src/scheduler.js";

const pad = (n) => String(n).padStart(2, "0");

test("once: due when scheduled and time has passed", () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const future = new Date(Date.now() + 3_600_000).toISOString();
  assert.equal(isDue({ status: "scheduled", schedule: { type: "once", at: past } }, new Date()), true);
  assert.equal(isDue({ status: "scheduled", schedule: { type: "once", at: future } }, new Date()), false);
});

test("once: not due if already sent or currently sending", () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(isDue({ status: "sent", schedule: { type: "once", at: past } }, new Date()), false);
  assert.equal(isDue({ status: "sending", schedule: { type: "once", at: past } }, new Date()), false);
});

test("daily: due at matching HH:MM once per day", () => {
  const now = new Date();
  const at = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const today = now.toISOString().slice(0, 10);
  assert.equal(isDue({ status: "scheduled", schedule: { type: "daily", at }, lastRunDay: null }, now), true);
  // ya ejecutada hoy → no vuelve a disparar
  assert.equal(isDue({ status: "scheduled", schedule: { type: "daily", at }, lastRunDay: today }, now), false);
});

test("daily: not due at a different minute", () => {
  const now = new Date();
  const other = new Date(now.getTime() + 5 * 60_000);
  const at = `${pad(other.getHours())}:${pad(other.getMinutes())}`;
  assert.equal(isDue({ status: "scheduled", schedule: { type: "daily", at }, lastRunDay: null }, now), false);
});
