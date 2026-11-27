import { describe, expect, it } from "vitest";

import { DB_QUOTA_MESSAGE, DB_UNREACHABLE_MESSAGE, detectDatabaseOutage } from "./database-unavailable";

function prismaError(name: string, message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { name, ...extra });
}

describe("detectDatabaseOutage", () => {
  it("recognises Neon's quota block (the real 27/11 outage)", () => {
    const e = prismaError(
      "PrismaClientUnknownRequestError",
      "Invalid `prisma.user.findUnique()` invocation:\n\nError querying the database: FATAL: Your account or project has exceeded the compute time quota.",
    );
    expect(detectDatabaseOutage(e)).toEqual({ reason: "quota", message: DB_QUOTA_MESSAGE });
  });

  it("recognises an unreachable server, a pool timeout and a paused Supabase project", () => {
    expect(detectDatabaseOutage(prismaError("PrismaClientInitializationError", "Can't reach database server at x:5432", { errorCode: "P1001" }))?.reason).toBe("unreachable");
    expect(detectDatabaseOutage(prismaError("PrismaClientKnownRequestError", "Timed out fetching a new connection from the connection pool", { code: "P2024" }))?.message).toBe(DB_UNREACHABLE_MESSAGE);
    expect(detectDatabaseOutage(prismaError("PrismaClientInitializationError", "FATAL: Tenant or user not found"))?.reason).toBe("unreachable");
  });

  it("leaves other errors alone (including network errors from other integrations)", () => {
    expect(detectDatabaseOutage(prismaError("PrismaClientKnownRequestError", "Unique constraint failed", { code: "P2002" }))).toBeNull();
    expect(detectDatabaseOutage(new Error("connect ECONNREFUSED 1.2.3.4:443"))).toBeNull();
    expect(detectDatabaseOutage(new Error("You exceeded your current quota"))).toBeNull();
    expect(detectDatabaseOutage(undefined)).toBeNull();
  });
});
