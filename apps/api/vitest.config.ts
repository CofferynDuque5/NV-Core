import { defineConfig } from "vitest/config";

/**
 * Unit tests for the API.
 *
 * Coverage gate: the API is mostly NestJS modules / provider adapters whose real
 * coverage comes from the live smoke + Playwright E2E suites (they need a DB and
 * external providers), so a whole-src threshold would be misleading. Instead the
 * gate is scoped to the deterministic, business-critical *pure logic* — the code
 * where a silent regression would be most damaging and where unit tests give
 * real signal: token/password hashing, at-rest crypto, segment evaluation, drip
 * scheduling and template rendering. Thresholds sit just below the achieved
 * numbers so a regression fails CI.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/auth/password.util.ts",
        "src/auth/token.util.ts",
        "src/common/crypto/crypto.util.ts",
        "src/modules/campaigns/render.ts",
        "src/modules/segments/segment-eval.ts",
        "src/modules/sequences/sequence-engine.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
