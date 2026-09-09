import { describe, expect, it } from "vitest";

import { migrationDatabaseUrl, sanitizeDatabaseUrl } from "./database-url";

describe("sanitizeDatabaseUrl", () => {
  it("collapses a duplicated ?sslmode=require (double '?')", () => {
    expect(
      sanitizeDatabaseUrl("postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require?sslmode=require"),
    ).toBe("postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require");
  });

  it("drops channel_binding (Prisma unsupported) and keeps sslmode", () => {
    expect(
      sanitizeDatabaseUrl("postgresql://u:p@host.neon.tech/db?sslmode=require&channel_binding=require"),
    ).toBe("postgresql://u:p@host.neon.tech/db?sslmode=require");
  });

  it("adds sslmode=require to a remote URL that lacks it", () => {
    expect(sanitizeDatabaseUrl("postgresql://u:p@host.neon.tech/db")).toBe(
      "postgresql://u:p@host.neon.tech/db?sslmode=require",
    );
  });

  it("never forces SSL on a local database", () => {
    expect(sanitizeDatabaseUrl("postgresql://nvcore:postgres@localhost:5432/nvcore?schema=public")).toBe(
      "postgresql://nvcore:postgres@localhost:5432/nvcore?schema=public",
    );
    expect(sanitizeDatabaseUrl("postgresql://u:p@127.0.0.1:5432/db")).toBe(
      "postgresql://u:p@127.0.0.1:5432/db",
    );
  });

  it("dedupes repeated params keeping the first", () => {
    expect(sanitizeDatabaseUrl("postgresql://u:p@host.neon.tech/db?sslmode=require&sslmode=prefer")).toBe(
      "postgresql://u:p@host.neon.tech/db?sslmode=require",
    );
  });

  it("passes through undefined/empty", () => {
    expect(sanitizeDatabaseUrl(undefined)).toBeUndefined();
    expect(sanitizeDatabaseUrl("")).toBe("");
  });

  it("migrationDatabaseUrl uses Neon's direct (non-pooler) host", () => {
    expect(
      migrationDatabaseUrl("postgresql://u:p@ep-a-b-pooler.us-east-2.aws.neon.tech/db?sslmode=require"),
    ).toBe("postgresql://u:p@ep-a-b.us-east-2.aws.neon.tech/db?sslmode=require");
  });
});
