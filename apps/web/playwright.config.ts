import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Assumes the API + web are already running (see CI or run them
 * locally with the backend enabled). Point at another host with NV_BASE_URL.
 *
 * A clean database is expected: the first registered user claims a workspace
 * and becomes its Owner.
 */
const baseURL = process.env.NV_BASE_URL ?? "http://localhost:3000";

// In the sandbox the browser lives at a fixed path; CI uses the default.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    ...(executablePath ? { launchOptions: { executablePath, args: ["--no-sandbox"] } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
