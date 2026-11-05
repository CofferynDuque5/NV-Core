import { describe, expect, it } from "vitest";
import type { Conversation } from "@nv/domain";

import { UNASSIGNED, allLabels, fillReply, filterConversations, firstReplyLabel, greetingFor, openCount, waitInfo, withLabel, withoutLabel } from "./inbox";

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

describe("waitInfo", () => {
  const now = new Date("2026-11-05T12:00:00Z").getTime();
  it("is null without a waiting time", () => {
    expect(waitInfo(undefined, now)).toBeNull();
    expect(waitInfo("nope", now)).toBeNull();
  });
  it("labels minutes, hours and days and flags late chats", () => {
    expect(waitInfo("2026-11-05T11:59:40Z", now)).toEqual({ label: "ahora", late: false });
    expect(waitInfo("2026-11-05T11:15:00Z", now)).toEqual({ label: "45 min", late: false });
    expect(waitInfo("2026-11-05T10:59:00Z", now)).toEqual({ label: "1 h", late: true });
    expect(waitInfo("2026-11-03T11:00:00Z", now)).toEqual({ label: "2 d", late: true });
  });
});

describe("fillReply", () => {
  const now = new Date(2026, 10, 5, 9, 30);
  it("fills the contact's first name, greeting, date and brand", () => {
    expect(
      fillReply("{{saludo}} {{nombre}}, gracias por escribir a {{nombre_marca}} ({{fecha}}).", {
        contactName: "Lucía Pérez",
        brandName: "NV Streaming",
        now,
      }),
    ).toBe("Buenos días Lucía, gracias por escribir a NV Streaming (5 de noviembre).");
    expect(fillReply("{{nombre_completo}}", { contactName: "Lucía Pérez", now })).toBe("Lucía Pérez");
  });
  it("leaves a phone-number chat without a name and tidies the spacing", () => {
    expect(fillReply("Hola {{nombre}}, ¿cómo estás?", { contactName: "+58 412 111 0000", now })).toBe("Hola, ¿cómo estás?");
  });
  it("keeps unknown variables as they are", () => {
    expect(fillReply("Precio: {{precio}}", { now })).toBe("Precio: {{precio}}");
  });
  it("greets by the hour", () => {
    expect(greetingFor(8)).toBe("Buenos días");
    expect(greetingFor(15)).toBe("Buenas tardes");
    expect(greetingFor(22)).toBe("Buenas noches");
  });
});

describe("firstReplyLabel", () => {
  it("says how fast the team answered", () => {
    expect(firstReplyLabel(undefined)).toBeNull();
    expect(firstReplyLabel(null)).toBe("Aún sin primera respuesta");
    expect(firstReplyLabel(0)).toBe("Primera respuesta en menos de 1 min");
    expect(firstReplyLabel(12)).toBe("Primera respuesta en 12 min");
    expect(firstReplyLabel(150)).toBe("Primera respuesta en 3 h");
    expect(firstReplyLabel(2900)).toBe("Primera respuesta en 2 d");
  });
});
