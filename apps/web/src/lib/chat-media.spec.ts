import { describe, expect, it } from "vitest";

import { durationLabel, fileSizeLabel, voiceFileName, voiceMimeType } from "./chat-media";

describe("chat media helpers", () => {
  it("labels file sizes in B, KB and MB", () => {
    expect(fileSizeLabel(0)).toBe("");
    expect(fileSizeLabel(Number.NaN)).toBe("");
    expect(fileSizeLabel(512)).toBe("512 B");
    expect(fileSizeLabel(2048)).toBe("2 KB");
    expect(fileSizeLabel(3.5 * 1024 * 1024)).toBe("3,5 MB");
  });

  it("labels durations as m:ss", () => {
    expect(durationLabel(0)).toBe("0:00");
    expect(durationLabel(7.4)).toBe("0:07");
    expect(durationLabel(75)).toBe("1:15");
    expect(durationLabel(-3)).toBe("0:00");
  });

  it("picks the best recording format the browser has", () => {
    expect(voiceMimeType(() => true)).toBe("audio/ogg;codecs=opus");
    expect(voiceMimeType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(voiceMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(voiceMimeType(() => false)).toBeNull();
  });

  it("names the recording by its format", () => {
    expect(voiceFileName("audio/ogg;codecs=opus")).toBe("nota-de-voz.ogg");
    expect(voiceFileName("audio/mp4")).toBe("nota-de-voz.m4a");
    expect(voiceFileName("audio/webm;codecs=opus")).toBe("nota-de-voz.webm");
  });
});
