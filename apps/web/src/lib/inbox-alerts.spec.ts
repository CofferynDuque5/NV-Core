import { afterEach, describe, expect, it, vi } from "vitest";

import { keyBytes, playChime, setSoundEnabled, soundEnabled, titleWithCount } from "./inbox-alerts";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("inbox alerts", () => {
  it("keeps the unread count at the start of the tab title", () => {
    expect(titleWithCount("Inbox · NV Marketing", 3)).toBe("(3) Inbox · NV Marketing");
    expect(titleWithCount("(3) Inbox · NV Marketing", 5)).toBe("(5) Inbox · NV Marketing");
    expect(titleWithCount("(5) Inbox · NV Marketing", 0)).toBe("Inbox · NV Marketing");
    expect(titleWithCount("Inbox", 150)).toBe("(99+) Inbox");
    expect(titleWithCount("(99+) Inbox", 2)).toBe("(2) Inbox");
  });

  it("sound is on by default and remembers when it is turned off", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(soundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(soundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(soundEnabled()).toBe(true);
  });

  it("stays on when the browser blocks storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(soundEnabled()).toBe(true);
    expect(() => setSoundEnabled(false)).not.toThrow();
  });

  it("does not play before the page was touched", () => {
    expect(playChime()).toBe(false);
  });

  it("decodes the server key from base64url", () => {
    expect([...keyBytes("AQID")]).toEqual([1, 2, 3]);
    expect([...keyBytes("-_8")]).toEqual([251, 255]);
    expect(keyBytes("BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U")).toHaveLength(65);
  });
});
