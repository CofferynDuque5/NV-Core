import { describe, expect, it } from "vitest";

import {
  chatFileExt,
  chatFileHeaders,
  mediaLabel,
  mediaToken,
  publicChatMedia,
  readMediaToken,
  sniffSendable,
} from "./chat-media";

const secret = "test-secret";
const msgId = "cm3abcdefghijklmnopqrstu";

describe("media links", () => {
  it("open only the brand and message they were made for, until they expire", () => {
    const now = Date.UTC(2026, 10, 11, 0, 1);
    const token = mediaToken(secret, "mi-marca", msgId, now);
    expect(readMediaToken(secret, token, now + 1000)).toEqual({ workspace: "mi-marca", messageId: msgId });
    expect(readMediaToken(secret, token, now + 8 * 60 * 60_000)).toBeNull(); // expired
    // Same link for the whole hour, so the browser keeps the photo cached.
    expect(mediaToken(secret, "mi-marca", msgId, now + 5 * 60_000)).toBe(token);
    expect(readMediaToken("other-secret", token, now)).toBeNull(); // other server
    expect(readMediaToken(secret, token.replace("mi-marca", "otra-marca"), now)).toBeNull(); // other brand
    const [ws, , exp, sig] = token.split(".");
    expect(readMediaToken(secret, [ws, "cm3otherotherotherother", exp, sig].join("."), now)).toBeNull();
    expect(readMediaToken(secret, "../../etc/passwd", now)).toBeNull();
  });
});

describe("files to send", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  it("go by their content, not by the name or the type the browser says", () => {
    expect(sniffSendable(jpeg, "application/pdf")).toEqual({ kind: "image", mime: "image/jpeg" });
    expect(sniffSendable(Buffer.from("OggS\0\0"), "audio/ogg")).toEqual({ kind: "voice", mime: "audio/ogg" });
    expect(sniffSendable(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), "audio/webm;codecs=opus")).toEqual({ kind: "voice", mime: "audio/webm" });
    expect(sniffSendable(Buffer.from("%PDF-1.7"), "application/pdf")).toEqual({ kind: "document", mime: "application/pdf" });
    expect(sniffSendable(Buffer.from("<html><script>"), "image/png")).toBeNull();
    expect(sniffSendable(Buffer.from("MZ\x90\0"), "application/octet-stream")).toBeNull();
    expect(sniffSendable(Buffer.from("hola,mundo"), "text/csv")).toEqual({ kind: "document", mime: "text/csv" });
  });
});

describe("serving chat files", () => {
  it("never runs anything and only shows media inline", () => {
    const img = chatFileHeaders("0123456789abcdef0123456789abcdef.jpg");
    expect(img["Content-Type"]).toBe("image/jpeg");
    expect(img["Content-Disposition"]).toBe("inline");
    expect(img["X-Content-Type-Options"]).toBe("nosniff");
    expect(img["Content-Security-Policy"]).toContain("sandbox");
    const bin = chatFileHeaders("0123456789abcdef0123456789abcdef.bin", 'factura"; x.html');
    expect(bin["Content-Type"]).toBe("application/octet-stream");
    expect(bin["Content-Disposition"]).toMatch(/^attachment; filename="factura__ x.html"/);
    expect(chatFileExt("audio/ogg; codecs=opus")).toBe("ogg");
    expect(chatFileExt("application/x-msdownload")).toBe("bin");
  });

  it("never hands the sealed WhatsApp message to the panel", () => {
    const pub = publicChatMedia({ kind: "voice", mime: "audio/ogg", size: 10, seconds: 4, ref: "secret" }, "https://x/y");
    expect(pub).toEqual({ kind: "voice", mime: "audio/ogg", size: 10, seconds: 4, url: "https://x/y" });
    expect(publicChatMedia({ kind: "video", mime: "video/mp4", size: 9, unavailable: "grande" }, "u").url).toBeUndefined();
  });

  it("labels attachments for the chat list", () => {
    expect(mediaLabel("image", null, "precio")).toBe("📷 Foto precio");
    expect(mediaLabel("voice")).toBe("🎤 Nota de voz");
    expect(mediaLabel("document", "lista.pdf")).toBe("📄 lista.pdf");
  });
});
