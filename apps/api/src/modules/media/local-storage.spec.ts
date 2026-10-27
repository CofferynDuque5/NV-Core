import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaService, type UploadedDiskFile } from "./media.module";
import { STORED_NAME_RE, displayName, fileSpec, servesInline, storedFileName } from "./local-storage";
import type { PrismaService } from "../../prisma/prisma.service";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n");
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(8)]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

describe("local storage rules", () => {
  it("accepts only listed types and checks the real content", () => {
    expect(fileSpec("image/png")?.sniff(PNG)).toBe(true);
    expect(fileSpec("image/png")?.sniff(HTML)).toBe(false);
    expect(fileSpec("application/pdf")?.sniff(PDF)).toBe(true);
    expect(fileSpec("video/mp4")?.sniff(MP4)).toBe(true);
    expect(fileSpec("video/quicktime")?.kind).toBe("video");
    expect(fileSpec("text/html")).toBeUndefined();
    expect(fileSpec("image/svg+xml")).toBeUndefined();
    expect(fileSpec("application/x-msdownload")).toBeUndefined();
  });

  it("generates random names that the server can match, never the user's", () => {
    const a = storedFileName("png");
    expect(a).toMatch(STORED_NAME_RE);
    expect(storedFileName("png")).not.toBe(a);
    expect("../../etc/passwd").not.toMatch(STORED_NAME_RE);
    expect(".htaccess").not.toMatch(STORED_NAME_RE);
  });

  it("keeps only the base name for display", () => {
    expect(displayName("C:\\fotos\\promo.png", "x")).toBe("promo.png");
    expect(displayName("../../a.pdf", "x")).toBe("a.pdf");
    expect(displayName("", "fallback.pdf")).toBe("fallback.pdf");
  });

  it("documents download, except PDF; media plays inline", () => {
    expect(servesInline("mp4")).toBe(true);
    expect(servesInline("pdf")).toBe(true);
    expect(servesInline("docx")).toBe(false);
    expect(servesInline("exe")).toBe(false);
  });
});

describe("MediaService.saveFile / serveFile", () => {
  let dir: string;
  let tmp: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "nv-media-"));
    tmp = await mkdtemp(join(tmpdir(), "nv-upload-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(tmp, { recursive: true, force: true });
  });

  function makeService(enabled = true) {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      enabled: true,
      mediaFolder: {
        findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceSlug: string } }) =>
          where.id === "f1" && where.workspaceSlug === "w1" ? { id: "f1" } : null,
        ),
      },
      mediaAsset: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "a1", tag: null, folderId: null, createdAt: new Date(), ...data };
          created.push(row);
          return row;
        }),
      },
    };
    const config = {
      get: (key: string) =>
        key === "media"
          ? { enabled, dir, maxBytes: 1024 * 1024, publicBase: "https://app.example.com" }
          : undefined,
    };
    const audit = { record: vi.fn() };
    const service = new MediaService(
      prisma as unknown as PrismaService,
      audit as never,
      config as never,
      {} as never,
    );
    return { service, created, audit };
  }

  async function upload(content: Buffer, mimetype: string, originalname: string): Promise<UploadedDiskFile> {
    const path = join(tmp, `up-${Math.random().toString(16).slice(2)}`);
    await writeFile(path, content);
    return { path, size: content.length, mimetype, originalname };
  }

  it("stores the file under the workspace folder and returns a public URL", async () => {
    const { service, created, audit } = makeService();
    const file = await upload(PDF, "application/pdf", "Catálogo 2026.pdf");
    const res = await service.saveFile("w1", "ana@x", file, { library: "true", folderId: "f1" });

    expect(res.file.url).toMatch(/^https:\/\/app\.example\.com\/api\/files\/w1\/[a-f0-9]{32}\.pdf$/);
    expect(res.file).toMatchObject({ kind: "document", filename: "Catálogo 2026.pdf", size: PDF.length });
    const saved = await readdir(join(dir, "w1"));
    expect(saved).toHaveLength(1);
    expect(await readFile(join(dir, "w1", saved[0]!))).toEqual(PDF);
    // The temp upload is moved, not copied.
    expect(await readdir(tmp)).toHaveLength(0);
    expect(created[0]).toMatchObject({ type: "document", folderId: "f1", url: res.file.url });
    expect(res.asset?.type).toBe("document");
    expect(audit.record).toHaveBeenCalledWith("w1", "ana@x", "media.file.upload", saved[0]);
    // Direct web access to the folder is blocked (cPanel serves the app folder).
    expect(await readFile(join(dir, ".htaccess"), "utf8")).toContain("Require all denied");
  });

  it("does not add to the library unless asked", async () => {
    const { service, created } = makeService();
    const res = await service.saveFile("w1", "ana@x", await upload(MP4, "video/mp4", "reel.mp4"));
    expect(res.asset).toBeNull();
    expect(res.file.kind).toBe("video");
    expect(created).toHaveLength(0);
  });

  it("rejects disallowed types and disguised content, and removes the temp file", async () => {
    const { service } = makeService();
    await expect(
      service.saveFile("w1", "a", await upload(HTML, "text/html", "x.html")),
    ).rejects.toThrow(/no permitido/);
    await expect(
      service.saveFile("w1", "a", await upload(HTML, "image/png", "foto.png")),
    ).rejects.toThrow(/no coincide/);
    expect(await readdir(tmp)).toHaveLength(0);
    await expect(readdir(join(dir, "w1"))).rejects.toThrow();
  });

  it("rejects a folder from another workspace before saving", async () => {
    const { service } = makeService();
    await expect(
      service.saveFile("w1", "a", await upload(PNG, "image/png", "a.png"), {
        library: "true",
        folderId: "otra",
      }),
    ).rejects.toThrow(/Carpeta/);
    await expect(readdir(join(dir, "w1"))).rejects.toThrow();
  });

  it("says when server storage is turned off", async () => {
    const { service } = makeService(false);
    await expect(
      service.saveFile("w1", "a", await upload(PNG, "image/png", "a.png")),
    ).rejects.toThrow(/no configurado/);
    expect(await readdir(tmp)).toHaveLength(0);
  });

  it("serves only generated names, with safe headers", async () => {
    const { service } = makeService();
    const { file } = await service.saveFile("w1", "a", await upload(PNG, "image/png", "a.png"));
    const name = file.url.split("/").pop()!;
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => (headers[k] = v),
      sendFile: vi.fn(),
    };
    await service.serveFile("w1", name, res as never);
    expect(res.sendFile).toHaveBeenCalledWith(join(dir, "w1", name), expect.anything(), expect.any(Function));
    expect(headers["Content-Type"]).toBe("image/png");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("cross-origin");
    expect(headers["Content-Security-Policy"]).toContain("sandbox");

    await expect(service.serveFile("w1", "../w2/secret.png", res as never)).rejects.toThrow(/no encontrado/);
    await expect(service.serveFile("..", name, res as never)).rejects.toThrow(/no encontrado/);
    // Same name under another workspace does not exist.
    await expect(service.serveFile("w2", name, res as never)).rejects.toThrow(/no encontrado/);
  });
});
