import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RemuxError, oggCrc, opusPacketSamples, webmToOggOpus } from "./opus-remux";

const chrome = readFileSync(join(__dirname, "__fixtures__", "voice-chrome.webm"));

/** Split an Ogg file into its pages, checking each page's CRC. */
function pages(ogg: Buffer) {
  const out: { flags: number; granule: bigint; seq: number; body: Buffer }[] = [];
  let pos = 0;
  while (pos < ogg.length) {
    expect(ogg.subarray(pos, pos + 4).toString("ascii")).toBe("OggS");
    const n = ogg[pos + 26]!;
    const lacing = ogg.subarray(pos + 27, pos + 27 + n);
    const bodyLen = lacing.reduce((a, b) => a + b, 0);
    const page = Buffer.from(ogg.subarray(pos, pos + 27 + n + bodyLen));
    const crc = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    expect(oggCrc(page)).toBe(crc);
    out.push({ flags: ogg[pos + 5]!, granule: ogg.readBigInt64LE(pos + 6), seq: ogg.readUInt32LE(pos + 18), body: page.subarray(27 + n) });
    pos += 27 + n + bodyLen;
  }
  return out;
}

describe("webmToOggOpus", () => {
  it("rewraps a voice note recorded by Chrome into a valid Ogg/Opus file", () => {
    const { ogg, seconds } = webmToOggOpus(chrome);
    const list = pages(ogg);
    expect(list[0]!.flags).toBe(0x02);
    expect(list[0]!.body.subarray(0, 8).toString("ascii")).toBe("OpusHead");
    expect(list[1]!.body.subarray(0, 8).toString("ascii")).toBe("OpusTags");
    expect(list.at(-1)!.flags).toBe(0x04);
    list.forEach((p, i) => expect(p.seq).toBe(i));
    for (let i = 3; i < list.length; i++) expect(list[i]!.granule >= list[i - 1]!.granule).toBe(true);
    expect(seconds).toBeGreaterThanOrEqual(3);
    expect(seconds).toBeLessThanOrEqual(4);
  });

  it("refuses files that aren't WebM", () => {
    expect(() => webmToOggOpus(Buffer.from("OggS not webm"))).toThrow(RemuxError);
    expect(() => webmToOggOpus(Buffer.alloc(0))).toThrow(RemuxError);
  });
});

describe("opusPacketSamples", () => {
  it("reads the frame length from the TOC byte", () => {
    expect(opusPacketSamples(Buffer.from([0xfc]))).toBe(960); // CELT 20 ms, 1 frame
    expect(opusPacketSamples(Buffer.from([0xfd]))).toBe(1920); // 2 frames
    expect(opusPacketSamples(Buffer.from([0x18]))).toBe(2880); // SILK 60 ms
    expect(opusPacketSamples(Buffer.from([0xff, 0x03]))).toBe(2880); // code 3, 3 frames of 20 ms
    expect(opusPacketSamples(Buffer.alloc(0))).toBe(0);
  });
});
