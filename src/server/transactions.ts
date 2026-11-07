import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { isValidYmd, localInputToUtc, rangeToUtc } from "@/lib/dates";
import { calculateTotals, InvalidTotalsError, summarizeBalance } from "@/lib/money";
import { freeLoadFits, freeLoadPriceCents } from "@/lib/promo";
import type { TransactionInput } from "@/lib/validation";
import { assertCan, type Actor } from "@/server/access";
import { writeAudit } from "@/server/audit";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";
import { assertFreeLoadAvailable, hasFreeLoadAvailable, isCustomerEnrolled } from "@/server/promo";
import { getSettings } from "@/server/settings";
import {
  assertNotFuture,
  assertNotVoided,
  financialTransaction,
  lockTransaction,
  nextReceiptNumber,
} from "@/server/transaction-support";

const PAGE_SIZE = 20;

const SORT_FIELDS = {
  orderDate: "orderDate",
  receiptNumber: "receiptNumber",
  totalCents: "totalCents",
  status: "status",
} as const;

export type TransactionFilters = {
  q?: string;
  status?: OrderStatus;
  from?: string;
  to?: string;
  sort?: string;
  direction?: "asc" | "desc";
  page?: number;
};

export async function buildTransactionWhere(
  filters: TransactionFilters,
): Promise<Prisma.LaundryTransactionWhereInput> {
  const { timeZone } = await getSettings();
  const orderDate: Prisma.DateTimeFilter = {};
  if (filters.from && isValidYmd(filters.from)) {
    orderDate.gte = rangeToUtc({ from: filters.from, to: filters.from }, timeZone).start;
  }
  if (filters.to && isValidYmd(filters.to)) {
    orderDate.lt = rangeToUtc({ from: filters.to, to: filters.to }, timeZone).endExclusive;
  }
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(Object.keys(orderDate).length ? { orderDate } : {}),
    ...(filters.q
      ? {
          OR: [
            { receiptNumber: { contains: filters.q, mode: "insensitive" } },
            { customer: { name: { contains: filters.q, mode: "insensitive" } } },
            { customer: { phone: { contains: filters.q } } },
          ],
        }
      : {}),
  };
}

function orderBy(filters: TransactionFilters): Prisma.LaundryTransactionOrderByWithRelationInput[] {
  if (filters.sort === "name") {
    // Walk-in orders have no customer and sort after named ones.
    return [
      { customer: { name: filters.direction ?? "asc" } },
      { orderDate: "desc" },
      { id: "desc" },
    ];
  }
  const field = SORT_FIELDS[filters.sort as keyof typeof SORT_FIELDS] ?? "orderDate";
  return [{ [field]: filters.direction ?? "desc" }, { id: "desc" }];
}

/** Sorts that group orders by how much has been paid on them. */
const PAYMENT_STATE_SORTS = ["paid", "unpaid"] as const;
type PaymentStateSort = (typeof PAYMENT_STATE_SORTS)[number];

function isPaymentStateSort(sort: string | undefined): sort is PaymentStateSort {
  return PAYMENT_STATE_SORTS.includes(sort as PaymentStateSort);
}

/**
 * One page of order ids, grouped as the payment badge shows them: paid in full,
 * partial, unpaid, then voided last; newest first within a group. The balance is
 * not stored, so it is worked out here exactly as `summarizeBalance` does: the
 * total minus payments that were not reversed (refunds do not reopen a balance).
 */
async function pageIdsByPaymentState(
  ids: string[],
  sort: PaymentStateSort,
  skip: number,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const [paidRank, unpaidRank] = sort === "paid" ? [0, 2] : [2, 0];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT t."id"
    FROM "LaundryTransaction" t
    LEFT JOIN (
      SELECT "transactionId", SUM("amountCents") AS "paidCents"
      FROM "Payment"
      WHERE "type" = 'PAYMENT' AND "reversedAt" IS NULL AND "transactionId" = ANY(${ids}::text[])
      GROUP BY "transactionId"
    ) p ON p."transactionId" = t."id"
    WHERE t."id" = ANY(${ids}::text[])
    ORDER BY
      CASE
        WHEN t."voidedAt" IS NOT NULL THEN 3
        WHEN t."totalCents" - COALESCE(p."paidCents", 0) = 0 THEN ${paidRank}
        WHEN COALESCE(p."paidCents", 0) > 0 THEN 1
        ELSE ${unpaidRank}
      END,
      t."orderDate" DESC,
      t."id" DESC
    LIMIT ${PAGE_SIZE} OFFSET ${skip}`;
  return rows.map((row) => row.id);
}

const LIST_INCLUDE = {
  customer: { select: { name: true, phone: true } },
  payments: { select: { type: true, amountCents: true, reversedAt: true } },
} as const satisfies Prisma.LaundryTransactionInclude;

/** The full financial view of orders. */
export async function listTransactions(actor: Actor, filters: TransactionFilters) {
  assertCan(actor, "transactions:view");
  const where = await buildTransactionWhere(filters);
  const page = filters.page ?? 1;

  if (isPaymentStateSort(filters.sort)) {
    // The filters stay in one place (Prisma); SQL only orders the matching ids.
    const matching = await prisma.laundryTransaction.findMany({ where, select: { id: true } });
    const ids = matching.map((row) => row.id);
    const pageIds = await pageIdsByPaymentState(ids, filters.sort, (page - 1) * PAGE_SIZE);
    const found = await prisma.laundryTransaction.findMany({
      where: { id: { in: pageIds } },
      include: LIST_INCLUDE,
    });
    const byId = new Map(found.map((row) => [row.id, row]));
    const rows = pageIds.flatMap((id) => byId.get(id) ?? []);
    return {
      rows: rows.map(({ payments, ...row }) => ({
        ...row,
        ...summarizeBalance(row.totalCents, payments, row.voidedAt !== null),
      })),
      total: ids.length,
      pageSize: PAGE_SIZE,
    };
  }

  const [rows, total] = await Promise.all([
    prisma.laundryTransaction.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: orderBy(filters),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.laundryTransaction.count({ where }),
  ]);
  return {
    rows: rows.map(({ payments, ...row }) => ({
      ...row,
      ...summarizeBalance(row.totalCents, payments, row.voidedAt !== null),
    })),
    total,
    pageSize: PAGE_SIZE,
  };
}

/** The operations view for laundry staff. It selects no amounts at all. */
export async function listOrders(actor: Actor, filters: TransactionFilters) {
  assertCan(actor, "orders:view");
  const where = await buildTransactionWhere(filters);
  const page = filters.page ?? 1;
  // Staff see no amounts, so sorts that would reveal them fall back to date.
  const field =
    filters.sort === "totalCents" || isPaymentStateSort(filters.sort) ? "orderDate" : filters.sort;
  const [rows, total] = await Promise.all([
    prisma.laundryTransaction.findMany({
      where,
      select: {
        id: true,
        receiptNumber: true,
        status: true,
        orderDate: true,
        dueDate: true,
        customer: { select: { name: true } },
      },
      orderBy: orderBy({ ...filters, sort: field }),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.laundryTransaction.count({ where }),
  ]);
  return { rows, total, pageSize: PAGE_SIZE };
}

export async function getTransactionDetail(actor: Actor, id: string) {
  assertCan(actor, "transactions:view");
  const transaction = await prisma.laundryTransaction.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { orderBy: { id: "asc" } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
      payments: {
        orderBy: [{ paidAt: "desc" }, { id: "desc" }],
        include: {
          receivedBy: { select: { name: true } },
          reversedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!transaction) throw new NotFoundError("The order");
  return {
    ...transaction,
    ...summarizeBalance(transaction.totalCents, transaction.payments, !!transaction.voidedAt),
  };
}

export async function getOrderDetail(actor: Actor, id: string) {
  assertCan(actor, "orders:view");
  const order = await prisma.laundryTransaction.findUnique({
    where: { id },
    select: {
      id: true,
      receiptNumber: true,
      status: true,
      orderDate: true,
      dueDate: true,
      notes: true,
      voidedAt: true,
      customer: { select: { name: true } },
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          serviceNameSnapshot: true,
          pricingUnitSnapshot: true,
          quantityMilli: true,
        },
      },
    },
  });
  if (!order) throw new NotFoundError("The order");
  return order;
}

async function resolveCustomerId(tx: Prisma.TransactionClient, input: TransactionInput) {
  if (input.customerId) {
    const existing = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!existing) throw new NotFoundError("The customer");
    return existing.id;
  }
  if (!input.customerName) return null;
  const match = await tx.customer.findFirst({
    where: {
      name: { equals: input.customerName, mode: "insensitive" },
      phone: input.customerPhone,
    },
  });
  if (match) return match.id;
  const created = await tx.customer.create({
    data: { name: input.customerName, phone: input.customerPhone, email: input.customerEmail },
  });
  return created.id;
}

type ExistingItem = {
  serviceId: string | null;
  serviceNameSnapshot: string;
  pricingUnitSnapshot: Prisma.TransactionItemCreateManyInput["pricingUnitSnapshot"];
  promoEligibleSnapshot: boolean;
};

/**
 * Builds item rows with server-side totals. Names and units come from the
 * catalog, not the client. When editing, a service already on the order keeps
 * its original snapshot, and may stay on the order even if since archived.
 */
async function buildItems(
  tx: Prisma.TransactionClient,
  input: TransactionInput,
  useFreeLoad: boolean,
  existingItems: ExistingItem[] = [],
) {
  const serviceIds = [...new Set(input.items.map((item) => item.serviceId))];
  const services = await tx.service.findMany({ where: { id: { in: serviceIds } } });
  const serviceById = new Map(services.map((service) => [service.id, service]));

  const rows = input.items.map((item) => {
    const previous = existingItems.find((existing) => existing.serviceId === item.serviceId);
    const service = serviceById.get(item.serviceId);
    if (!service) throw new NotFoundError("A selected service");
    if (!service.isActive && !previous) {
      throw new DomainError(`${service.name} is no longer offered.`);
    }
    return {
      serviceId: service.id,
      serviceNameSnapshot: previous?.serviceNameSnapshot ?? service.name,
      pricingUnitSnapshot: previous?.pricingUnitSnapshot ?? service.pricingUnit,
      promoEligibleSnapshot: previous?.promoEligibleSnapshot ?? service.promoEligible,
      quantityMilli: item.quantity,
      unitPriceCents: item.unitPrice,
    };
  });

  const promoDiscountCents = useFreeLoad
    ? freeLoadPriceCents(rows.map((row) => ({ ...row, promoEligible: row.promoEligibleSnapshot })))
    : 0;
  if (promoDiscountCents === null) {
    throw new DomainError("A free load needs at least 1 load of a promo service on the order.");
  }

  let totals;
  try {
    totals = calculateTotals(rows, input.discount, input.additionalCharge, promoDiscountCents);
  } catch (error) {
    if (error instanceof InvalidTotalsError) throw new DomainError(error.message);
    throw error;
  }

  const items = rows.map((row, index) => ({
    ...row,
    lineTotalCents: totals.lineTotalsCents[index] ?? 0,
  }));
  return { items, totals, promoDiscountCents };
}

/**
 * Whether this save spends a free load. An order that already holds one keeps
 * it, even with the promo off, so a later edit cannot change what was agreed.
 */
async function resolveFreeLoad(
  tx: Prisma.TransactionClient,
  input: TransactionInput,
  customerId: string | null,
  promoEnabled: boolean,
  held?: { promoFreeLoad: boolean; customerId: string | null },
) {
  if (!input.redeemFreeLoad) return false;
  if (held?.promoFreeLoad && held.customerId === customerId) return true;
  if (!promoEnabled) throw new DomainError("The promo is off, so free loads cannot be used.");
  if (!customerId) throw new DomainError("A free load needs a named customer.");
  await assertFreeLoadAvailable(tx, customerId);
  return true;
}

/**
 * Whether a new order uses a free load with no cashier asking for it. Nothing
 * here refuses the order: when the free load does not apply, the customer keeps it.
 */
async function appliesFreeLoadByItself(
  tx: Prisma.TransactionClient,
  input: TransactionInput,
  customerId: string | null,
  promoEnabled: boolean,
) {
  if (!promoEnabled || !customerId) return false;
  const marked = await tx.service.findMany({
    where: { id: { in: input.items.map((item) => item.serviceId) }, promoEligible: true },
    select: { id: true },
  });
  const markedIds = new Set(marked.map((service) => service.id));
  const lines = input.items.map((item) => ({
    promoEligible: markedIds.has(item.serviceId),
    quantityMilli: item.quantity,
    unitPriceCents: item.unitPrice,
  }));
  return freeLoadFits(lines, input.discount) && hasFreeLoadAvailable(tx, customerId);
}

function resolveDates(input: TransactionInput, timeZone: string) {
  const orderDate = localInputToUtc(input.orderDate, timeZone);
  const dueDate = input.dueDate ? localInputToUtc(input.dueDate, timeZone) : null;
  assertNotFuture(orderDate, "order date");
  if (dueDate && dueDate < orderDate) {
    throw new DomainError("The due date cannot be before the order date.");
  }
  return { orderDate, dueDate };
}

export async function createTransaction(actor: Actor, input: TransactionInput) {
  assertCan(actor, "transactions:create");
  const settings = await getSettings();
  const { orderDate, dueDate } = resolveDates(input, settings.timeZone);

  return financialTransaction(async (tx) => {
    const customerId = await resolveCustomerId(tx, input);
    const promoFreeLoad =
      input.redeemFreeLoad === undefined
        ? await appliesFreeLoadByItself(tx, input, customerId, settings.promoEnabled)
        : await resolveFreeLoad(tx, input, customerId, settings.promoEnabled);
    const { items, totals, promoDiscountCents } = await buildItems(tx, input, promoFreeLoad);
    const promoEarning = settings.promoEnabled && (await isCustomerEnrolled(tx, customerId));
    const receiptNumber = await nextReceiptNumber(tx, settings, orderDate);
    const created = await tx.laundryTransaction.create({
      data: {
        receiptNumber,
        customerId,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        additionalChargeCents: totals.additionalChargeCents,
        promoDiscountCents,
        promoFreeLoad,
        promoEarning,
        totalCents: totals.totalCents,
        orderDate,
        dueDate,
        notes: input.notes,
        createdById: actor.id,
        items: { create: items },
      },
      include: { items: true },
    });
    await writeAudit(tx, actor, {
      action: "transaction.create",
      entityType: "LaundryTransaction",
      entityId: created.id,
      after: created,
    });
    return created;
  });
}

export async function updateTransaction(actor: Actor, id: string, input: TransactionInput) {
  assertCan(actor, "transactions:edit");
  const settings = await getSettings();
  const { orderDate, dueDate } = resolveDates(input, settings.timeZone);

  return financialTransaction(async (tx) => {
    const before = await lockTransaction(tx, id);
    assertNotVoided(before);

    const customerId = await resolveCustomerId(tx, input);
    const promoFreeLoad = await resolveFreeLoad(
      tx,
      input,
      customerId,
      settings.promoEnabled,
      before,
    );
    const { items, totals, promoDiscountCents } = await buildItems(
      tx,
      input,
      promoFreeLoad,
      before.items,
    );
    const { paidCents } = summarizeBalance(before.totalCents, before.payments);
    if (totals.totalCents < paidCents) {
      throw new DomainError(
        "The new total is less than what has been paid. Refund or reverse a payment first.",
      );
    }

    // Item rows are replaced; the audit entry keeps the previous rows in full.
    await tx.transactionItem.deleteMany({ where: { transactionId: id } });
    const after = await tx.laundryTransaction.update({
      where: { id },
      data: {
        customerId,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        additionalChargeCents: totals.additionalChargeCents,
        promoDiscountCents,
        promoFreeLoad,
        totalCents: totals.totalCents,
        orderDate,
        dueDate,
        notes: input.notes,
        updatedById: actor.id,
        items: { create: items },
      },
      include: { items: true },
    });
    await writeAudit(tx, actor, {
      action: "transaction.update",
      entityType: "LaundryTransaction",
      entityId: id,
      before,
      after,
    });
    return after;
  });
}

export async function updateOrderStatus(actor: Actor, id: string, status: OrderStatus) {
  assertCan(actor, "orders:update-status");
  if (status === "CANCELLED") throw new DomainError("Void the order to cancel it.");

  return financialTransaction(async (tx) => {
    const before = await lockTransaction(tx, id);
    assertNotVoided(before);
    if (status === "COMPLETED" || before.status === "COMPLETED") {
      assertCan(actor, "orders:complete");
    }
    const after = await tx.laundryTransaction.update({
      where: { id },
      data: {
        status,
        completedAt: status === "COMPLETED" ? (before.completedAt ?? new Date()) : null,
        updatedById: actor.id,
      },
    });
    await writeAudit(tx, actor, {
      action: "transaction.status",
      entityType: "LaundryTransaction",
      entityId: id,
      before: { status: before.status },
      after: { status },
    });
    return after;
  });
}

/**
 * Voiding removes an order from sales and balances. The order must not be
 * holding the customer's money, otherwise collected totals would keep cash that
 * no valid sale explains. Refund or reverse first.
 */
export async function voidTransaction(actor: Actor, id: string, reason: string) {
  assertCan(actor, "transactions:void");
  return financialTransaction(async (tx) => {
    const before = await lockTransaction(tx, id);
    assertNotVoided(before);
    const { netPaidCents } = summarizeBalance(before.totalCents, before.payments);
    if (netPaidCents > 0) {
      throw new DomainError("This order still holds payments. Refund or reverse them first.");
    }
    const after = await tx.laundryTransaction.update({
      where: { id },
      data: {
        status: "CANCELLED",
        voidedAt: new Date(),
        voidedById: actor.id,
        voidReason: reason,
        updatedById: actor.id,
      },
    });
    await writeAudit(tx, actor, {
      action: "transaction.void",
      entityType: "LaundryTransaction",
      entityId: id,
      before,
      after,
      reason,
    });
    return after;
  });
}
