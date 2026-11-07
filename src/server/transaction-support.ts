import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { formatInZone } from "@/lib/dates";
import { DomainError, NotFoundError } from "@/server/errors";
import { prisma } from "@/server/db";

/**
 * A database transaction for financial writes. The longer limits leave room to
 * wait on a row lock held by another cashier.
 */
export function financialTransaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(run, { maxWait: 10_000, timeout: 20_000 });
}

/**
 * Locks an order row and returns it with its payments. Everything that reads a
 * balance before changing it goes through here, so two concurrent writers
 * cannot both act on the same stale balance.
 */
export async function lockTransaction(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "LaundryTransaction" WHERE "id" = ${id} FOR UPDATE`;
  const transaction = await tx.laundryTransaction.findUnique({
    where: { id },
    include: { payments: true, items: true },
  });
  if (!transaction) throw new NotFoundError("The order");
  return transaction;
}

export function assertNotVoided(transaction: { voidedAt: Date | null }) {
  if (transaction.voidedAt) throw new DomainError("This order has been voided.");
}

/** Allows for a slightly fast device clock, but not a real future date. */
export function assertNotFuture(date: Date, label: string) {
  if (date.getTime() > Date.now() + 5 * 60_000) {
    throw new DomainError(`The ${label} cannot be in the future.`);
  }
}

/**
 * Receipt numbers look like KL-20261031-0001. The counter row is incremented
 * with a single atomic upsert that holds its row lock until commit, so numbers
 * stay unique and gap-free under concurrent creation.
 */
export async function nextReceiptNumber(
  tx: Prisma.TransactionClient,
  settings: { receiptPrefix: string; timeZone: string },
  orderDate: Date,
): Promise<string> {
  const day = formatInZone(orderDate, settings.timeZone, "yyyyMMdd");
  const [row] = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "ReceiptCounter" ("day", "lastValue") VALUES (${day}, 1)
    ON CONFLICT ("day") DO UPDATE SET "lastValue" = "ReceiptCounter"."lastValue" + 1
    RETURNING "lastValue"`;
  if (!row) throw new Error("The receipt counter did not return a value.");
  return `${settings.receiptPrefix}-${day}-${String(row.lastValue).padStart(4, "0")}`;
}
