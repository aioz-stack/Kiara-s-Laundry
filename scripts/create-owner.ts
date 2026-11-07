/**
 * Creates the first owner account and the default expense categories.
 *
 *   npm run owner:create -- "Full Name" owner@example.com
 *
 * The password is read from the OWNER_PASSWORD environment variable, or asked
 * for interactively, so it never lands in shell history.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_EXPENSE_CATEGORIES } from "../src/lib/defaults";
import { hashPassword } from "../src/lib/password";
import { userCreateSchema } from "../src/lib/validation";

async function readPassword() {
  if (process.env.OWNER_PASSWORD) return process.env.OWNER_PASSWORD;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const password = await prompt.question("Password (at least 10 characters): ");
  prompt.close();
  return password;
}

async function main() {
  const [name, email] = process.argv.slice(2);
  if (!name || !email) {
    throw new Error('Usage: npm run owner:create -- "Full Name" owner@example.com');
  }
  const input = userCreateSchema.parse({
    name,
    email,
    role: "OWNER",
    password: await readPassword(),
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const passwordHash = await hashPassword(input.password);
  await prisma.user.create({
    data: { name: input.name, email: input.email, role: "OWNER", passwordHash },
  });
  await prisma.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((category) => ({ name: category })),
    skipDuplicates: true,
  });
  await prisma.$disconnect();
  console.log(`Owner ${input.email} created.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
