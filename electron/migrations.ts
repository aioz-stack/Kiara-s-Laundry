import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";

/**
 * Applies the Prisma migrations without the Prisma CLI, which is too heavy to ship.
 * It keeps Prisma's own bookkeeping table, so `prisma migrate` still understands a
 * desktop database, and a restored copy of another database is not migrated twice.
 */
export async function applyMigrations(client: Client, migrationsDir: string) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
  const { rows } = await client.query<{ migration_name: string }>(
    `SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`,
  );
  const applied = new Set(rows.map((row) => row.migration_name));

  const names = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = readFileSync(join(migrationsDir, name, "migration.sql"), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations"
           ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
         VALUES ($1, $2, now(), $3, 1)`,
        [randomUUID(), createHash("sha256").update(sql).digest("hex"), name],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}
