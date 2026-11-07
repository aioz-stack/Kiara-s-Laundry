import path from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../electron/migrations";
import { firstOwnerSchema } from "@/lib/validation";
import { prisma } from "@/server/db";
import { createFirstOwner, isFirstRunSetupOpen } from "@/server/users";
import { resetDatabase } from "../support/fixtures";

const owner = (email = "owner@test.local") =>
  firstOwnerSchema.parse({
    name: "Kiara",
    email,
    password: "a-long-password",
    confirmPassword: "a-long-password",
  });

describe("first-run setup", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.DESKTOP_FIRST_RUN = "1";
  });

  afterEach(() => {
    delete process.env.DESKTOP_FIRST_RUN;
  });

  it("makes one owner with the default expense categories, and then closes", async () => {
    expect(await isFirstRunSetupOpen()).toBe(true);
    const created = await createFirstOwner(owner());
    expect(created.role).toBe("OWNER");
    expect(await prisma.expenseCategory.count()).toBeGreaterThan(0);
    expect(await isFirstRunSetupOpen()).toBe(false);
    await expect(createFirstOwner(owner("second@test.local"))).rejects.toThrow("already has");
  });

  it("is closed outside the desktop app, even with no users", async () => {
    delete process.env.DESKTOP_FIRST_RUN;
    expect(await isFirstRunSetupOpen()).toBe(false);
    await expect(createFirstOwner(owner())).rejects.toThrow("already has");
    expect(await prisma.user.count()).toBe(0);
  });

  it("lets only one of two concurrent attempts through", async () => {
    const results = await Promise.allSettled([
      createFirstOwner(owner("one@test.local")),
      createFirstOwner(owner("two@test.local")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it("needs matching passwords", () => {
    const result = firstOwnerSchema.safeParse({
      name: "Kiara",
      email: "owner@test.local",
      password: "a-long-password",
      confirmPassword: "something-else",
    });
    expect(result.success).toBe(false);
  });
});

describe("desktop migrations", () => {
  const databaseName = "kiara_desktop_migrations_test";
  const migrationsDir = path.resolve(import.meta.dirname, "../../prisma/migrations");
  const urlFor = (database: string) => {
    const url = new URL(process.env.DATABASE_URL as string);
    url.pathname = `/${database}`;
    return url.toString();
  };

  async function withAdmin(run: (admin: Client) => Promise<unknown>) {
    const admin = new Client({ connectionString: urlFor("postgres") });
    await admin.connect();
    await run(admin);
    await admin.end();
  }

  beforeEach(() =>
    withAdmin(async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    }),
  );

  afterEach(() =>
    withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)),
  );

  it("builds the schema once, and is safe to run on every start", async () => {
    const client = new Client({ connectionString: urlFor(databaseName) });
    await client.connect();
    await applyMigrations(client, migrationsDir);
    await applyMigrations(client, migrationsDir);

    const applied = await client.query(`SELECT "migration_name" FROM "_prisma_migrations"`);
    expect(applied.rowCount).toBe(4);
    const columns = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'LaundryTransaction' AND column_name = 'promoFreeLoad'`,
    );
    expect(columns.rowCount).toBe(1);
    await client.end();
  });
});
