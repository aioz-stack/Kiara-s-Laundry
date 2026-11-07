import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ quiet: true });

/** Integration tests never touch the development database. */
function testDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://localhost:5433/kiara_laundry");
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  "server-only": path.resolve(import.meta.dirname, "tests/support/server-only-stub.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/support/global-setup.ts"],
          env: { DATABASE_URL: testDatabaseUrl(), NEXTAUTH_SECRET: "test-secret" },
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
