import { describe, expect, it } from "vitest";

import {
  buildPreviewContent,
  firstVisual,
  previewSurfaces,
  previewVars,
  renderPreview,
} from "./content-preview";

const FIXED = new Date("2026-08-22T15:30:00");

describe("renderPreview", () => {
  it("substitutes known variables and leaves unknown tokens", () => {
    const out = renderPreview("Hola {{grupo}}, hoy {{fecha}} y {{otro}}", {
      grupo: "VIP",
      fecha: "22/08/2026",
    });
    expect(out).toBe("Hola VIP, hoy 22/08/2026 y {{otro}}");
  });

  it("tolerates spaces inside the braces and empty templates", () => {
    expect(renderPreview("{{ grupo }}", { grupo: "X" })).toBe("X");
    expect(renderPreview("", { grupo: "X" })).toBe("");
  });
});

describe("previewVars", () => {
  it("uses the group name when given and a fallback otherwise", () => {
    expect(previewVars("Clientes", FIXED).grupo).toBe("Clientes");
    expect(previewVars("  ", FIXED).grupo).toBe("Mi grupo");
    expect(previewVars(undefined, FIXED).grupo).toBe("Mi grupo");
  });

  it("provides fecha and hora sample values", () => {
    const v = previewVars("G", FIXED);
    expect(v.fecha).toBeTruthy();
    expect(v.hora).toBeTruthy();
  });
});

describe("firstVisual", () => {
  it("returns the first image/video with a URL", () => {
    const v = firstVisual([
      { kind: "document", url: "d.pdf" },
      { kind: "image", url: "a.jpg" },
      { kind: "video", url: "b.mp4" },
    ]);
    expect(v?.url).toBe("a.jpg");
  });

  it("ignores attachments without a URL and returns null when none match", () => {
    expect(firstVisual([{ kind: "image" }])).toBeNull();
    expect(firstVisual([{ kind: "document", url: "d.pdf" }])).toBeNull();
    expect(firstVisual(undefined)).toBeNull();
  });
});

describe("previewSurfaces", () => {
  it("lists enabled surfaces in compose order", () => {
    const s = previewSurfaces({
      hasWaGroup: true,
      hasTgGroup: true,
      waStatus: true,
      fb: true,
      ig: true,
      igFormat: "reel",
    });
    expect(s.map((x) => x.id)).toEqual(["wa", "tg", "wa_status", "fb", "ig"]);
    expect(s.find((x) => x.id === "ig")?.format).toBe("reel");
  });

  it("defaults the IG format to feed", () => {
    const s = previewSurfaces({ ig: true });
    expect(s.find((x) => x.id === "ig")?.format).toBe("feed");
  });

  it("falls back to a WhatsApp chat mock when nothing is enabled", () => {
    expect(previewSurfaces({}).map((x) => x.id)).toEqual(["wa"]);
  });
});

describe("buildPreviewContent", () => {
  it("renders text and picks the first visual + attachment count", () => {
    const c = buildPreviewContent({
      message: "Hola {{grupo}}",
      groupName: "Promo",
      attachments: [
        { kind: "image", url: "a.jpg" },
        { kind: "video", url: "b.mp4" },
        { kind: "document", url: "d.pdf" },
      ],
      now: FIXED,
    });
    expect(c.text).toBe("Hola Promo");
    expect(c.visual?.url).toBe("a.jpg");
    expect(c.attachmentsCount).toBe(3);
  });

  it("handles an empty draft", () => {
    const c = buildPreviewContent({ message: "", now: FIXED });
    expect(c.text).toBe("");
    expect(c.visual).toBeNull();
    expect(c.attachmentsCount).toBe(0);
  });
});
