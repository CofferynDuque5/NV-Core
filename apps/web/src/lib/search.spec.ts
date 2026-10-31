import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRecents,
  highlightParts,
  pushRecentItem,
  pushRecentQuery,
  recentItems,
  recentQueries,
  removeRecentQuery,
} from "./search";

describe("buscador: highlightParts", () => {
  it("resalta sin importar tildes y conserva la ortografía", () => {
    expect(highlightParts("María González", "maria")).toEqual([
      { text: "María", hit: true },
      { text: " González", hit: false },
    ]);
  });

  it("resalta cada palabra donde aparezca", () => {
    const parts = highlightParts("Promo Black Friday promo", "promo fri");
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["Promo", "Fri", "promo"]);
  });

  it("sin búsqueda devuelve el texto tal cual", () => {
    expect(highlightParts("Hola", "  ")).toEqual([{ text: "Hola", hit: false }]);
  });
});

/** In-memory localStorage (vitest runs in a node env). */
function stubWindow() {
  const map = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    },
  };
}

describe("buscador: recientes", () => {
  beforeEach(() => {
    stubWindow();
    clearRecents("marca");
  });

  it("guarda las búsquedas más nuevas primero, sin repetir", () => {
    pushRecentQuery("marca", "pago movil");
    pushRecentQuery("marca", "promo");
    pushRecentQuery("marca", "Pago Móvil");
    expect(recentQueries("marca")).toEqual(["Pago Móvil", "promo"]);
    expect(removeRecentQuery("marca", "promo")).toEqual(["Pago Móvil"]);
  });

  it("ignora búsquedas de una letra y guarda máximo 5", () => {
    pushRecentQuery("marca", "a");
    for (const q of ["uno", "dos", "tres", "cuatro", "cinco", "seis"]) pushRecentQuery("marca", q);
    expect(recentQueries("marca")).toEqual(["seis", "cinco", "cuatro", "tres", "dos"]);
  });

  it("cada marca tiene sus propios recientes", () => {
    pushRecentQuery("marca", "solo aquí");
    expect(recentQueries("otra")).toEqual([]);
  });

  it("recuerda lo abierto sin duplicados y descarta rutas externas", () => {
    pushRecentItem(
      "marca",
      { kind: "contact", id: "1", title: "Ana", path: "contactos?contacto=1" },
      1,
    );
    pushRecentItem(
      "marca",
      { kind: "contact", id: "1", title: "Ana", path: "contactos?contacto=1" },
      2,
    );
    window.localStorage.setItem(
      "nv-search:marca:items",
      JSON.stringify([
        ...recentItems("marca"),
        { kind: "page", id: "x", title: "x", path: "javascript:alert(1)", at: 3 },
      ]),
    );
    expect(recentItems("marca").map((i) => i.id)).toEqual(["1"]);
  });
});
