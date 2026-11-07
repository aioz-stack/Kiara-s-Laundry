import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ quiet: true });

const PORT = 3100;

/** End-to-end tests run on their own database and never touch development data. */
function e2eDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://localhost:5433/kiara_laundry");
  url.pathname = `${url.pathname}_e2e`;
  return url.toString();
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The server starts before any Playwright setup hook, so the database is prepared here.
    command: `npx tsx tests/e2e/prepare-db.ts && npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: e2eDatabaseUrl(),
      NEXTAUTH_URL: `http://localhost:${PORT}`,
      NEXTAUTH_SECRET: "e2e-only-secret",
    },
  },
});
