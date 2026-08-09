import { describe, expect, it } from "vitest";
import type { Group } from "@nv/domain";

import { filterGroups, groupCategories } from "./groups";

function g(partial: Partial<Group> & { id: string; name: string }): Group {
  return {
    channel: "wa",
    members: 0,
    admins: 0,
    tags: [],
    ...partial,
  } as Group;
}

const items: Group[] = [
  g({ id: "1", name: "Universidad Redes", tags: ["universidad"], remoteJid: "111@g.us" }),
  g({ id: "2", name: "Equipo Marketing", tags: ["trabajo"], remoteJid: "222@g.us" }),
  g({ id: "3", name: "Universidad IA", tags: ["universidad", "trabajo"] }),
  g({ id: "4", name: "Sin categoría", tags: [] }),
];

describe("groups helpers", () => {
  it("groupCategories returns sorted unique tags", () => {
    expect(groupCategories(items)).toEqual(["trabajo", "universidad"]);
    expect(groupCategories([])).toEqual([]);
  });

  it("filterGroups by category matches groups carrying that tag", () => {
    expect(filterGroups(items, { category: "universidad" }).map((x) => x.id)).toEqual(["1", "3"]);
    expect(filterGroups(items, { category: "trabajo" }).map((x) => x.id)).toEqual(["2", "3"]);
  });

  it("filterGroups by text matches name or JID, case-insensitive", () => {
    expect(filterGroups(items, { q: "marketing" }).map((x) => x.id)).toEqual(["2"]);
    expect(filterGroups(items, { q: "111" }).map((x) => x.id)).toEqual(["1"]);
  });

  it("empty query/category returns everything; combined filters intersect", () => {
    expect(filterGroups(items, {}).length).toBe(4);
    expect(filterGroups(items, { q: "ia", category: "universidad" }).map((x) => x.id)).toEqual(["3"]);
  });
});
