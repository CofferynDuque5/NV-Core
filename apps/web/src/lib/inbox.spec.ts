import { describe, expect, it } from "vitest";
import type { Conversation } from "@nv/domain";

import { UNASSIGNED, allLabels, filterConversations, openCount, withLabel, withoutLabel } from "./inbox";

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: "c1",
  channel: "wa",
  contactName: "Ana",
  contactInitials: "A",
  preview: "",
  unread: 0,
  lastMessageAt: "",
  resolved: false,
  labels: [],
  ...over,
});

const items: Conversation[] = [
  conv({ id: "a", contactName: "Ana", channel: "wa", assignee: "me@x", labels: ["ventas"], resolved: false }),
  conv({ id: "b", contactName: "Bob", channel: "ig", assignee: undefined, labels: ["soporte"], resolved: true }),
  conv({ id: "c", contactName: "Cira", channel: "wa", assignee: "you@x", labels: [], resolved: false }),
];

describe("filterConversations", () => {
  it("filters by status", () => {
    expect(filterConversations(items, { status: "open" }).map((c) => c.id)).toEqual(["a", "c"]);
    expect(filterConversations(items, { status: "resolved" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterConversations(items, { status: "all" })).toHaveLength(3);
  });
  it("filters by channel", () => {
    expect(filterConversations(items, { channel: "wa" }).map((c) => c.id)).toEqual(["a", "c"]);
  });
  it("filters by assignee (exact and unassigned)", () => {
    expect(filterConversations(items, { assignee: "me@x" }).map((c) => c.id)).toEqual(["a"]);
    expect(filterConversations(items, { assignee: UNASSIGNED }).map((c) => c.id)).toEqual(["b"]);
  });
  it("searches name and labels", () => {
    expect(filterConversations(items, { q: "ci" }).map((c) => c.id)).toEqual(["c"]);
    expect(filterConversations(items, { q: "soporte" }).map((c) => c.id)).toEqual(["b"]);
  });
  it("combines filters", () => {
    expect(filterConversations(items, { status: "open", channel: "wa", q: "ana" }).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("allLabels", () => {
  it("returns distinct sorted labels", () => {
    expect(allLabels(items)).toEqual(["soporte", "ventas"]);
  });
});

describe("openCount", () => {
  it("counts unresolved", () => {
    expect(openCount(items)).toBe(2);
  });
});

describe("withLabel / withoutLabel", () => {
  it("adds without duplicates and trims", () => {
    expect(withLabel(["a"], "b")).toEqual(["a", "b"]);
    expect(withLabel(["a"], "a")).toEqual(["a"]);
    expect(withLabel(["a"], "  c ")).toEqual(["a", "c"]);
    expect(withLabel(["a"], "  ")).toEqual(["a"]);
  });
  it("removes a label", () => {
    expect(withoutLabel(["a", "b"], "a")).toEqual(["b"]);
  });
});
