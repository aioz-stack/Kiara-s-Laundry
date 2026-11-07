import { execSync } from "node:child_process";
import { Client } from "pg";

/** Creates the test database if needed and brings it to the latest migration. */
export default async function setup({ config }: { config: { env?: Record<string, string> } }) {
  const databaseUrl = config.env?.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

  const url = new URL(databaseUrl);
  const database = url.pathname.slice(1);
  url.pathname = "/postgres";

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (existing.rowCount === 0) await client.query(`CREATE DATABASE "${database}"`);
  await client.end();

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}
