import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit tests only (src). The Playwright e2e specs under e2e/ are excluded — they
 * run via `pnpm test:e2e`, not vitest.
 *
 * Coverage gate: scoped to the pure logic under src/lib/** (the code that is
 * actually unit-tested). Side-effect modules that depend on the browser or
 * import.meta.env (cloudinary, env, utils, connection-status) are excluded —
 * they are exercised by the e2e suite / live smoke instead of unit tests.
 * Thresholds sit just below the achieved numbers so a regression fails CI while
 * leaving normal headroom.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.spec.{ts,tsx}"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**"],
      exclude: [
        "src/lib/**/*.spec.{ts,tsx}",
        "src/lib/cloudinary.ts",
        "src/lib/env.ts",
        "src/lib/utils.ts",
        "src/lib/connection-status.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 85,
        lines: 90,
      },
    },
  },
});
