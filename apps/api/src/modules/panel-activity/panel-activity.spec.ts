import { describe, expect, it } from "vitest";

import { deviceKind } from "../../common/device";
import { sectionOf } from "./panel-activity.service";

describe("sectionOf", () => {
  it("takes the section and brand from a panel route", () => {
    expect(sectionOf("/w/mi-marca/campanas/123?x=1")).toEqual({ workspaceSlug: "mi-marca", section: "campanas" });
    expect(sectionOf("/w/mi-marca")).toEqual({ workspaceSlug: "mi-marca", section: "dashboard" });
    expect(sectionOf("/perfil")).toEqual({ workspaceSlug: null, section: "perfil" });
    expect(sectionOf("/")).toEqual({ workspaceSlug: null, section: "inicio" });
  });
});

describe("deviceKind", () => {
  it("tells phones, tablets and computers apart", () => {
    expect(deviceKind("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1")).toBe("movil");
    expect(deviceKind("Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36")).toBe("movil");
    expect(deviceKind("Mozilla/5.0 (Linux; Android 14; SM-X200) Chrome/130.0 Safari/537.36")).toBe("tablet");
    expect(deviceKind("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1")).toBe("tablet");
    expect(deviceKind("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36")).toBe("computadora");
    expect(deviceKind(null)).toBe("computadora");
  });
});
