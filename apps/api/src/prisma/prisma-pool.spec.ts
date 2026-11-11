import { describe, expect, it } from "vitest";

import { withPoolDefaults } from "./prisma.service";

describe("withPoolDefaults", () => {
  it("allows 10 connections and a 20 s wait when the URL says nothing", () => {
    const url = new URL(withPoolDefaults("postgresql://u:p@db.example.com/nv?sslmode=require"));
    expect(url.searchParams.get("connection_limit")).toBe("10");
    expect(url.searchParams.get("pool_timeout")).toBe("20");
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.password).toBe("p");
  });

  it("keeps what the URL already sets", () => {
    const url = new URL(withPoolDefaults("postgres://u:p@h/db?connection_limit=3&pool_timeout=5&pgbouncer=true"));
    expect(url.searchParams.get("connection_limit")).toBe("3");
    expect(url.searchParams.get("pool_timeout")).toBe("5");
    expect(url.searchParams.get("pgbouncer")).toBe("true");
  });

  it("leaves anything that is not a Postgres URL alone", () => {
    expect(withPoolDefaults("not a url")).toBe("not a url");
    expect(withPoolDefaults("file:./dev.db")).toBe("file:./dev.db");
  });
});
