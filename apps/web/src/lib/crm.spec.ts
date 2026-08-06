import { describe, expect, it } from "vitest";
import type { Contact } from "@nv/domain";

import { filterContacts, groupByStage, stageCounts, STAGE_ACCENTS } from "./crm";

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: "c1",
  name: "Ana",
  tags: [],
  stage: "Lead",
  createdAt: "",
  ...over,
});

const items: Contact[] = [
  contact({ id: "a", name: "Ana", company: "Acme", stage: "Lead", tags: ["vip"] }),
  contact({ id: "b", name: "Bob", email: "bob@x.com", stage: "Cliente" }),
  contact({ id: "c", name: "Cira", phone: "600", stage: "Lead" }),
];

describe("filterContacts", () => {
  it("filters by stage", () => {
    expect(filterContacts(items, { stage: "Lead" }).map((c) => c.id)).toEqual(["a", "c"]);
    expect(filterContacts(items, { stage: "" })).toHaveLength(3);
  });
  it("searches across name/company/email/phone/tags", () => {
    expect(filterContacts(items, { q: "acme" }).map((c) => c.id)).toEqual(["a"]);
    expect(filterContacts(items, { q: "bob@x" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterContacts(items, { q: "vip" }).map((c) => c.id)).toEqual(["a"]);
    expect(filterContacts(items, { q: "600" }).map((c) => c.id)).toEqual(["c"]);
  });
});

describe("groupByStage", () => {
  it("returns all canonical stages with their contacts, in order", () => {
    const cols = groupByStage(items);
    expect(cols.map((c) => c.stage)).toEqual(["Lead", "Cliente", "En riesgo", "Inactivo"]);
    expect(cols[0]!.items.map((c) => c.id)).toEqual(["a", "c"]);
    expect(cols[1]!.items.map((c) => c.id)).toEqual(["b"]);
    expect(cols[2]!.items).toHaveLength(0); // empty column still present
    expect(cols[0]!.accent).toBe(STAGE_ACCENTS.Lead);
  });
});

describe("stageCounts", () => {
  it("counts contacts per stage", () => {
    expect(stageCounts(items)).toEqual({ Lead: 2, Cliente: 1, "En riesgo": 0, Inactivo: 0 });
  });
});
