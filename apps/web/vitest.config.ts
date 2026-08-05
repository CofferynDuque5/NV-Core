import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit tests only (src). The Playwright e2e specs under e2e/ are excluded — they
 * run via `pnpm test:e2e`, not vitest.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.spec.{ts,tsx}"],
    environment: "node",
  },
});
