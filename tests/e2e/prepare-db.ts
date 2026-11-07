import { execSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { E2E_PASSWORD, E2E_USERS } from "./constants";

/** Rebuilds the e2e database so every run starts from the same state. */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.endsWith("_e2e")) throw new Error("Refusing to run outside an e2e database.");

  const adminUrl = new URL(databaseUrl);
  const database = adminUrl.pathname.slice(1);
  adminUrl.pathname = "/postgres";

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();

  execSync("npx prisma migrate deploy", { env: process.env, stdio: "pipe" });

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const hash = await bcrypt.hash(E2E_PASSWORD, 4);
  for (const [role, email] of Object.entries(E2E_USERS)) {
    await client.query(
      `INSERT INTO "User" (id, name, email, "passwordHash", role, "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"Role", now())`,
      [`e2e-${role}`, `E2E ${role}`, email, hash, role],
    );
  }
  await client.query(
    `INSERT INTO "Service" (id, name, "pricingUnit", "currentPriceCents", "updatedAt") VALUES
       ('e2e-wash', 'Wash', 'PER_KG', 6500, now()),
       ('e2e-iron', 'Iron', 'PER_PIECE', 3500, now())`,
  );
  await client.query(
    `INSERT INTO "Service" (id, name, "pricingUnit", "currentPriceCents", "promoEligible", "updatedAt")
     VALUES ('e2e-load', 'Per load', 'PER_LOAD', 18000, true, now())`,
  );
  await client.query(
    `INSERT INTO "ExpenseCategory" (id, name, "updatedAt") VALUES ('e2e-rent', 'Rent', now())`,
  );
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
