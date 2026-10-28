import { describe, expect, it } from "vitest";
import type { Group } from "@nv/domain";

import { countryLine, groupStatus, requirementLabels } from "./groups";
import { matchesStatus } from "@/components/whatsapp/grupos-content";

const group = (over: Partial<Group> = {}): Group =>
  ({ id: "g1", name: "Ventas Caracas", channel: "wa", members: 10, tags: [], synced: true, ...over }) as Group;

describe("groupStatus", () => {
  it("a plain group is apto", () => {
    expect(groupStatus(group()).status).toBe("apto");
  });

  it("a kept-out group is apartado", () => {
    expect(groupStatus(group({ excluded: true })).status).toBe("apartado");
  });

  it("a university group or one that forbids ads is no apto, with the reason", () => {
    const uni = groupStatus(group({ category: "universidad" }));
    expect(uni.status).toBe("no-apto");
    expect(uni.reasons[0]).toMatch(/Universidad/i);
    expect(groupStatus(group({ forbidsAds: true })).status).toBe("no-apto");
    expect(groupStatus(group({ onlyAdmins: true })).status).toBe("no-apto");
  });

  it("price and photo requirements depend on each campaign, so the group stays apto", () => {
    expect(groupStatus(group({ requiresPrice: true, requiresImage: true })).status).toBe("apto");
  });
});

describe("matchesStatus", () => {
  it("filters groups with requirements and kept-out groups", () => {
    expect(matchesStatus(group({ requiresPrice: true }), "requisitos")).toBe(true);
    expect(matchesStatus(group({ requiresPrice: true, excluded: true }), "requisitos")).toBe(false);
    expect(matchesStatus(group({ excluded: true }), "apartado")).toBe(true);
    expect(matchesStatus(group(), "")).toBe(true);
  });
});

describe("countryLine and requirementLabels", () => {
  it("says the country, currency and how it was found", () => {
    expect(countryLine(group({ detectedCountry: "VE", countrySource: "nombre" }))).toBe("Venezuela · Bs (por el nombre)");
    expect(countryLine(group())).toBeNull();
  });

  it("lists the requirements", () => {
    expect(requirementLabels(group({ requiresPrice: true, onlyAdmins: true }))).toEqual(["Exige precio", "Solo admins"]);
  });
});
