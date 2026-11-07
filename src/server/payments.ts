import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod, PaymentType } from "@/generated/prisma/enums";
import { isValidYmd, localInputToUtc, rangeToUtc } from "@/lib/dates";
import { formatMoney, summarizeBalance } from "@/lib/money";
import type { PaymentInput, RefundInput } from "@/lib/validation";
import { assertCan, type Actor } from "@/server/access";
import { writeAudit } from "@/server/audit";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";
import { getSettings } from "@/server/settings";
import {
  assertNotFuture,
  assertNotVoided,
  financialTransaction,
  lockTransaction,
} from "@/server/transaction-support";

const PAGE_SIZE = 25;

const SORT_FIELDS = { paidAt: "paidAt", amountCents: "amountCents", method: "method" } as const;

export type PaymentFilters = {
  q?: string;
  method?: PaymentMethod;
  type?: PaymentType;
  from?: string;
  to?: string;
  sort?: string;
  direction?: "asc" | "desc";
  page?: number;
};

export async function buildPaymentWhere(
  filters: PaymentFilters,
): Promise<Prisma.PaymentWhereInput> {
  const { timeZone } = await getSettings();
  const paidAt: Prisma.DateTimeFilter = {};
  if (filters.from && isValidYmd(filters.from)) {
    paidAt.gte = rangeToUtc({ from: filters.from, to: filters.from }, timeZone).start;
  }
  if (filters.to && isValidYmd(filters.to)) {
    paidAt.lt = rangeToUtc({ from: filters.to, to: filters.to }, timeZone).endExclusive;
  }
  return {
    ...(filters.method ? { method: filters.method } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(Object.keys(paidAt).length ? { paidAt } : {}),
    ...(filters.q
      ? {
          OR: [
            { referenceNumber: { contains: filters.q, mode: "insensitive" } },
            { transaction: { receiptNumber: { contains: filters.q, mode: "insensitive" } } },
            { transaction: { customer: { name: { contains: filters.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
}

export function paymentOrderBy(filters: PaymentFilters): Prisma.PaymentOrderByWithRelationInput[] {
  const field = SORT_FIELDS[filters.sort as keyof typeof SORT_FIELDS] ?? "paidAt";
  return [{ [field]: filters.direction ?? "desc" }, { id: "desc" }];
}

export async function listPayments(actor: Actor, filters: PaymentFilters) {
  assertCan(actor, "payments:view");
  const where = await buildPaymentWhere(filters);
  const page = filters.page ?? 1;
  const [rows, total, totalsByType] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        transaction: {
          select: {
            id: true,
            receiptNumber: true,
            customer: { select: { name: true } },
          },
        },
        receivedBy: { select: { name: true } },
      },
      orderBy: paymentOrderBy(filters),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({
      by: ["type"],
      where: { AND: [where, { reversedAt: null }] },
      _sum: { amountCents: true },
    }),
  ]);
  const sumOf = (type: PaymentType) =>
    totalsByType.find((row) => row.type === type)?._sum.amountCents ?? 0;
  return {
    rows,
    total,
    pageSize: PAGE_SIZE,
    receivedCents: sumOf("PAYMENT"),
    refundedCents: sumOf("REFUND"),
  };
}

export async function recordPayment(actor: Actor, transactionId: string, input: PaymentInput) {
  assertCan(actor, "payments:collect");
  const { timeZone, currency } = await getSettings();
  const paidAt = localInputToUtc(input.paidAt, timeZone);
  assertNotFuture(paidAt, "payment date");

  return financialTransaction(async (tx) => {
    const transaction = await lockTransaction(tx, transactionId);
    assertNotVoided(transaction);
    const { balanceCents } = summarizeBalance(transaction.totalCents, transaction.payments);
    if (input.amount > balanceCents) {
      throw new DomainError(
        `The amount is more than the remaining balance of ${formatMoney(balanceCents, currency)}.`,
      );
    }
    const payment = await tx.payment.create({
      data: {
        transactionId,
        type: "PAYMENT",
        amountCents: input.amount,
        method: input.method,
        paidAt,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
        receivedById: actor.id,
      },
    });
    await writeAudit(tx, actor, {
      action: "payment.create",
      entityType: "Payment",
      entityId: payment.id,
      after: payment,
    });
    return payment;
  });
}

export async function recordRefund(actor: Actor, transactionId: string, input: RefundInput) {
  assertCan(actor, "payments:adjust");
  const { timeZone, currency } = await getSettings();
  const paidAt = localInputToUtc(input.paidAt, timeZone);
  assertNotFuture(paidAt, "refund date");

  return financialTransaction(async (tx) => {
    const transaction = await lockTransaction(tx, transactionId);
    assertNotVoided(transaction);
    const { netPaidCents } = summarizeBalance(transaction.totalCents, transaction.payments);
    if (input.amount > netPaidCents) {
      throw new DomainError(
        `A refund cannot be more than the ${formatMoney(netPaidCents, currency)} kept on this order.`,
      );
    }
    const refund = await tx.payment.create({
      data: {
        transactionId,
        type: "REFUND",
        amountCents: input.amount,
        method: input.method,
        paidAt,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
        receivedById: actor.id,
      },
    });
    await writeAudit(tx, actor, {
      action: "payment.refund",
      entityType: "Payment",
      entityId: refund.id,
      after: refund,
      reason: input.notes,
    });
    return refund;
  });
}

/** Marks an entry as made in error. The row stays, excluded from every total. */
export async function reversePayment(actor: Actor, paymentId: string, reason: string) {
  assertCan(actor, "payments:adjust");
  const target = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!target) throw new NotFoundError("The payment");

  return financialTransaction(async (tx) => {
    const transaction = await lockTransaction(tx, target.transactionId);
    assertNotVoided(transaction);
    const before = transaction.payments.find((payment) => payment.id === paymentId);
    if (!before) throw new NotFoundError("The payment");
    if (before.reversedAt) throw new DomainError("This entry has already been reversed.");

    const { netPaidCents } = summarizeBalance(transaction.totalCents, transaction.payments);
    if (before.type === "PAYMENT" && before.amountCents > netPaidCents) {
      throw new DomainError("Part of this payment was refunded. Reverse the refund first.");
    }

    const after = await tx.payment.update({
      where: { id: paymentId },
      data: { reversedAt: new Date(), reversedById: actor.id, reversalReason: reason },
    });
    await writeAudit(tx, actor, {
      action: before.type === "PAYMENT" ? "payment.reverse" : "refund.reverse",
      entityType: "Payment",
      entityId: paymentId,
      before,
      after,
      reason,
    });
    return after;
  });
}
