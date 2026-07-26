import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildUploadSignature, parseCloudinaryUrl } from "./cloudinary";

describe("parseCloudinaryUrl", () => {
  it("parses a valid CLOUDINARY_URL", () => {
    expect(parseCloudinaryUrl("cloudinary://123456789:abcSecretXYZ@my-cloud")).toEqual({
      apiKey: "123456789",
      apiSecret: "abcSecretXYZ",
      cloudName: "my-cloud",
    });
  });

  it("returns null for undefined or malformed input", () => {
    expect(parseCloudinaryUrl(undefined)).toBeNull();
    expect(parseCloudinaryUrl("")).toBeNull();
    expect(parseCloudinaryUrl("https://example.com")).toBeNull();
    expect(parseCloudinaryUrl("cloudinary://onlykey@cloud")).toBeNull();
  });
});

describe("buildUploadSignature", () => {
  it("sorts params, appends the secret and SHA-1 hashes", () => {
    const sig = buildUploadSignature({ timestamp: 1700000000, folder: "nv/x" }, "SECRET");
    const expected = createHash("sha1")
      .update("folder=nv/x&timestamp=1700000000SECRET")
      .digest("hex");
    expect(sig).toBe(expected);
  });

  it("is deterministic and order-independent", () => {
    const a = buildUploadSignature({ folder: "f", timestamp: 10 }, "s");
    const b = buildUploadSignature({ timestamp: 10, folder: "f" }, "s");
    expect(a).toBe(b);
  });
});
