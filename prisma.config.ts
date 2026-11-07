import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` runs on install, before any .env exists, so a missing
    // value must not throw here. Commands that reach the database fail clearly.
    url: process.env.DATABASE_URL ?? "",
  },
});
