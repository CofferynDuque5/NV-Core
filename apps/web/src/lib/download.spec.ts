import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv, printReport } from "./download";

describe("descargar y imprimir informes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("descarga el CSV con el nombre pedido", () => {
    const a = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("document", { createElement: () => a, body: { appendChild: vi.fn() } });
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    downloadCsv("a,b", "informe.csv");
    expect(a.download).toBe("informe.csv");
    expect(a.click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("imprime en tema claro y luego vuelve al tema de antes", () => {
    const classes = new Set(["dark"]);
    const root = {
      className: "dark",
      classList: { remove: (c: string) => classes.delete(c), add: (c: string) => classes.add(c) },
    };
    let afterPrint: (() => void) | undefined;
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("window", {
      addEventListener: (_: string, fn: () => void) => (afterPrint = fn),
      removeEventListener: vi.fn(),
      print: vi.fn(),
    });
    printReport();
    expect(classes.has("light")).toBe(true);
    root.className = "light";
    afterPrint?.();
    expect(root.className).toBe("dark");
  });
});
