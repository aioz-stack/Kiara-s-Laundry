import "server-only";
import { summarizePromo, type PromoSummary } from "@/lib/promo";
import { assertCan, type Actor } from "@/server/access";
import { prisma, type DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { getSettings } from "@/server/settings";

function loadPromoOrders(db: DbClient, customerIds: string[]) {
  return db.laundryTransaction.findMany({
    where: {
      customerId: { in: customerIds },
      voidedAt: null,
      OR: [{ promoEarning: true }, { promoFreeLoad: true }],
    },
    select: {
      customerId: true,
      status: true,
      totalCents: true,
      voidedAt: true,
      promoEarning: true,
      promoFreeLoad: true,
      items: { select: { promoEligibleSnapshot: true, quantityMilli: true } },
      payments: { select: { type: true, amountCents: true, reversedAt: true } },
    },
  });
}

/**
 * Each customer's promo standing. A customer is left out while the promo is off
 * for the shop or for them, which is what hides it everywhere: callers show promo
 * details only for a customer found here.
 */
export async function getPromoStatuses(
  actor: Actor,
  customerIds: string[],
): Promise<Map<string, PromoSummary>> {
  assertCan(actor, "customers:view");
  const { promoEnabled } = await getSettings();
  if (!promoEnabled || customerIds.length === 0) return new Map();
  const enrolled = await prisma.customer.findMany({
    where: { id: { in: customerIds }, promoEnabled: true },
    select: { id: true },
  });
  const orders = await loadPromoOrders(
    prisma,
    enrolled.map(({ id }) => id),
  );
  return new Map(
    enrolled.map(({ id }) => [
      id,
      summarizePromo(orders.filter((order) => order.customerId === id)),
    ]),
  );
}

/** Whether a new order earns. A walk-in has no one to opt out. */
export async function isCustomerEnrolled(db: DbClient, customerId: string | null) {
  if (!customerId) return true;
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { promoEnabled: true },
  });
  return customer?.promoEnabled ?? false;
}

/** Locks the customer so two orders cannot spend the same free load. */
async function lockFreeLoads(db: DbClient, customerId: string) {
  await db.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
  const enrolled = await isCustomerEnrolled(db, customerId);
  const orders = await loadPromoOrders(db, [customerId]);
  return { enrolled, available: summarizePromo(orders).freeLoadsAvailable };
}

export async function assertFreeLoadAvailable(db: DbClient, customerId: string) {
  const { enrolled, available } = await lockFreeLoads(db, customerId);
  if (!enrolled) throw new DomainError("The promo is off for this customer.");
  if (available < 1) throw new DomainError("This customer has no free load available.");
}

export async function hasFreeLoadAvailable(db: DbClient, customerId: string) {
  const { enrolled, available } = await lockFreeLoads(db, customerId);
  return enrolled && available > 0;
}
