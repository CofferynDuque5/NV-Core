import { describe, expect, it } from "vitest";
import { campaignReadyProblems } from "./campaigns";

describe("campaignReadyProblems", () => {
  const now = new Date("2026-10-31T12:00:00");
  it("blocks an empty, targetless, past campaign", () => {
    expect(
      campaignReadyProblems(
        {
          message: "",
          attachments: 0,
          targets: 0,
          social: false,
          postToWaStatus: false,
          scheduleType: "once",
          dateTime: "2020-01-01T08:00",
        },
        now,
      ),
    ).toHaveLength(3);
  });
  it("lets a complete future campaign through", () => {
    expect(
      campaignReadyProblems(
        {
          message: "Hola",
          attachments: 0,
          targets: 2,
          social: false,
          postToWaStatus: false,
          scheduleType: "once",
          dateTime: "2026-11-02T08:00",
        },
        now,
      ),
    ).toEqual([]);
  });
});
