import assert from "node:assert/strict";
import { test } from "node:test";

import { fbConfigured, igConfigured } from "../src/meta.js";

test("fbConfigured requiere page id + token", () => {
  delete process.env.FB_PAGE_ID;
  delete process.env.FB_PAGE_TOKEN;
  assert.equal(fbConfigured(), false);
  process.env.FB_PAGE_ID = "123";
  assert.equal(fbConfigured(), false);
  process.env.FB_PAGE_TOKEN = "tok";
  assert.equal(fbConfigured(), true);
});

test("igConfigured requiere business id + token (propio o de página)", () => {
  delete process.env.IG_BUSINESS_ID;
  delete process.env.IG_ACCESS_TOKEN;
  process.env.FB_PAGE_TOKEN = "tok";
  assert.equal(igConfigured(), false);
  process.env.IG_BUSINESS_ID = "999";
  assert.equal(igConfigured(), true); // usa FB_PAGE_TOKEN como fallback
});
