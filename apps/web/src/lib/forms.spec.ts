import { describe, expect, it } from "vitest";

import { conversionRate, embedSnippet, publicFormUrl } from "./forms";

describe("forms helpers", () => {
  it("conversionRate = submissions/views %, 0 when no views", () => {
    expect(conversionRate({ views: 0, submissions: 0 })).toBe(0);
    expect(conversionRate({ views: 100, submissions: 25 })).toBe(25);
    expect(conversionRate({ views: 3, submissions: 1 })).toBe(33.3);
  });

  it("publicFormUrl builds the /f/:id URL, trimming a trailing slash", () => {
    expect(publicFormUrl("https://app.nv.com", "f1")).toBe("https://app.nv.com/f/f1");
    expect(publicFormUrl("https://app.nv.com/", "f1")).toBe("https://app.nv.com/f/f1");
  });

  it("embedSnippet contains the public URL in an iframe", () => {
    const snip = embedSnippet("https://app.nv.com", "f1");
    expect(snip).toContain("https://app.nv.com/f/f1");
    expect(snip).toContain("<iframe");
  });
});
