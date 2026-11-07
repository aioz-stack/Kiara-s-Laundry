import "server-only";
import type { PaymentMethod, PricingUnit } from "@/generated/prisma/enums";
import { bucketKeys, rangeToUtc, type DateRange, type Granularity } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { assertCan, type Actor } from "@/server/access";
import { prisma } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { getSettings } from "@/server/settings";

/**
 * All report figures. Sums run in the database and are cast to bigint so a long
 * date range cannot overflow; the values fit safely in a JS number.
 *
 * - Sales belong to the order date.
 * - Payments and refunds belong to the day the money moved.
 * - Expenses belong to the expense date.
 * - Day boundaries are in the shop time zone.
 */

const toNumber = (value: bigint | number | null) => Number(value ?? 0);

/** Cashiers may see a single day, and never expense figures. */
export function assertReportAccess(actor: Actor, range: DateRange) {
  if (can(actor.role, "reports:full")) return;
  if (can(actor.role, "reports:daily") && range.from === range.to) return;
  throw new ForbiddenError();
}

export type SalesSummary = {
  grossSalesCents: number;
  discountCents: number;
  promoDiscountCents: number;
  additionalChargeCents: number;
  subtotalCents: number;
  refundsOnValidOrdersCents: number;
  netSalesCents: number;
  orderCount: number;
  averageOrderCents: number;
  paymentsReceivedCents: number;
  refundsPaidCents: number;
  collectedCents: number;
  outstandingForPeriodCents: number;
  outstandingAllCents: number;
};

export async function getSalesSummary(actor: Actor, range: DateRange): Promise<SalesSummary> {
  assertReportAccess(actor, range);
  const { timeZone } = await getSettings();
  const { start, endExclusive } = rangeToUtc(range, timeZone);

  const [sales] = await prisma.$queryRaw<
    {
      gross: bigint;
      discount: bigint;
      promo: bigint;
      additional: bigint;
      subtotal: bigint;
      orders: bigint;
    }[]
  >`
    SELECT COALESCE(SUM("totalCents"), 0)::bigint AS gross,
           COALESCE(SUM("discountCents"), 0)::bigint AS discount,
           COALESCE(SUM("promoDiscountCents"), 0)::bigint AS promo,
           COALESCE(SUM("additionalChargeCents"), 0)::bigint AS additional,
           COALESCE(SUM("subtotalCents"), 0)::bigint AS subtotal,
           COUNT(*)::bigint AS orders
    FROM "LaundryTransaction"
    WHERE "voidedAt" IS NULL AND "status" <> 'CANCELLED'
      AND "orderDate" >= ${start} AND "orderDate" < ${endExclusive}`;

  const [cash] = await prisma.$queryRaw<
    { received: bigint; refunded: bigint; validRefunds: bigint }[]
  >`
    SELECT COALESCE(SUM(p."amountCents") FILTER (WHERE p."type" = 'PAYMENT'), 0)::bigint AS received,
           COALESCE(SUM(p."amountCents") FILTER (WHERE p."type" = 'REFUND'), 0)::bigint AS refunded,
           COALESCE(SUM(p."amountCents") FILTER (
             WHERE p."type" = 'REFUND' AND t."voidedAt" IS NULL AND t."status" <> 'CANCELLED'
           ), 0)::bigint AS "validRefunds"
    FROM "Payment" p
    JOIN "LaundryTransaction" t ON t."id" = p."transactionId"
    WHERE p."reversedAt" IS NULL
      AND p."paidAt" >= ${start} AND p."paidAt" < ${endExclusive}`;

  const [outstanding] = await prisma.$queryRaw<{ forPeriod: bigint; allOpen: bigint }[]>`
    SELECT COALESCE(SUM(b.balance) FILTER (
             WHERE b."orderDate" >= ${start} AND b."orderDate" < ${endExclusive}
           ), 0)::bigint AS "forPeriod",
           COALESCE(SUM(b.balance), 0)::bigint AS "allOpen"
    FROM (
      SELECT t."orderDate", t."totalCents" - COALESCE(SUM(p."amountCents"), 0) AS balance
      FROM "LaundryTransaction" t
      LEFT JOIN "Payment" p ON p."transactionId" = t."id"
        AND p."type" = 'PAYMENT' AND p."reversedAt" IS NULL
      WHERE t."voidedAt" IS NULL AND t."status" <> 'CANCELLED'
      GROUP BY t."id"
    ) b`;

  const grossSalesCents = toNumber(sales?.gross ?? 0n);
  const orderCount = toNumber(sales?.orders ?? 0n);
  const paymentsReceivedCents = toNumber(cash?.received ?? 0n);
  const refundsPaidCents = toNumber(cash?.refunded ?? 0n);
  const refundsOnValidOrdersCents = toNumber(cash?.validRefunds ?? 0n);

  return {
    grossSalesCents,
    discountCents: toNumber(sales?.discount ?? 0n),
    promoDiscountCents: toNumber(sales?.promo ?? 0n),
    additionalChargeCents: toNumber(sales?.additional ?? 0n),
    subtotalCents: toNumber(sales?.subtotal ?? 0n),
    refundsOnValidOrdersCents,
    netSalesCents: grossSalesCents - refundsOnValidOrdersCents,
    orderCount,
    averageOrderCents: orderCount ? Math.round(grossSalesCents / orderCount) : 0,
    paymentsReceivedCents,
    refundsPaidCents,
    collectedCents: paymentsReceivedCents - refundsPaidCents,
    outstandingForPeriodCents: toNumber(outstanding?.forPeriod ?? 0n),
    outstandingAllCents: toNumber(outstanding?.allOpen ?? 0n),
  };
}

export async function getExpenseTotal(actor: Actor, range: DateRange): Promise<number> {
  assertCan(actor, "expenses:view");
  const [row] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COALESCE(SUM("amountCents"), 0)::bigint AS total
    FROM "Expense"
    WHERE "voidedAt" IS NULL
      AND "expenseDate" >= ${range.from}::date AND "expenseDate" <= ${range.to}::date`;
  return toNumber(row?.total ?? 0n);
}

export type TrendPoint = {
  key: string;
  salesCents: number;
  collectedCents: number;
};

export async function getTrend(
  actor: Actor,
  range: DateRange,
  granularity: Granularity,
): Promise<TrendPoint[]> {
  assertReportAccess(actor, range);
  const { timeZone } = await getSettings();
  const { start, endExclusive } = rangeToUtc(range, timeZone);

  const sales = await prisma.$queryRaw<{ key: string; cents: bigint }[]>`
    SELECT to_char(
             date_trunc(${granularity}, ("orderDate" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}),
             'YYYY-MM-DD'
           ) AS key,
           SUM("totalCents")::bigint AS cents
    FROM "LaundryTransaction"
    WHERE "voidedAt" IS NULL AND "status" <> 'CANCELLED'
      AND "orderDate" >= ${start} AND "orderDate" < ${endExclusive}
    GROUP BY 1`;

  const collected = await prisma.$queryRaw<{ key: string; cents: bigint }[]>`
    SELECT to_char(
             date_trunc(${granularity}, ("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}),
             'YYYY-MM-DD'
           ) AS key,
           SUM(CASE WHEN "type" = 'PAYMENT' THEN "amountCents" ELSE -"amountCents" END)::bigint AS cents
    FROM "Payment"
    WHERE "reversedAt" IS NULL AND "paidAt" >= ${start} AND "paidAt" < ${endExclusive}
    GROUP BY 1`;

  const asMap = (rows: { key: string; cents: bigint }[]) =>
    new Map(rows.map((row) => [row.key, toNumber(row.cents)]));
  const salesByKey = asMap(sales);
  const collectedByKey = asMap(collected);

  return bucketKeys(range, granularity).map((key) => ({
    key,
    salesCents: salesByKey.get(key) ?? 0,
    collectedCents: collectedByKey.get(key) ?? 0,
  }));
}

export type ServiceSalesRow = {
  serviceName: string;
  pricingUnit: PricingUnit;
  quantityMilli: number;
  lineCount: number;
  salesCents: number;
};

/** Line totals before order-level discounts and charges. See the reconciliation
 *  in `SalesSummary`: subtotal - discount - free loads + additional charges =
 *  gross sales. */
export async function getSalesByService(
  actor: Actor,
  range: DateRange,
): Promise<ServiceSalesRow[]> {
  assertReportAccess(actor, range);
  const { timeZone } = await getSettings();
  const { start, endExclusive } = rangeToUtc(range, timeZone);
  const rows = await prisma.$queryRaw<
    {
      serviceName: string;
      pricingUnit: PricingUnit;
      quantity: bigint;
      lines: bigint;
      sales: bigint;
    }[]
  >`
    SELECT i."serviceNameSnapshot" AS "serviceName",
           i."pricingUnitSnapshot" AS "pricingUnit",
           SUM(i."quantityMilli")::bigint AS quantity,
           COUNT(*)::bigint AS lines,
           SUM(i."lineTotalCents")::bigint AS sales
    FROM "TransactionItem" i
    JOIN "LaundryTransaction" t ON t."id" = i."transactionId"
    WHERE t."voidedAt" IS NULL AND t."status" <> 'CANCELLED'
      AND t."orderDate" >= ${start} AND t."orderDate" < ${endExclusive}
    GROUP BY 1, 2
    ORDER BY sales DESC, "serviceName" ASC`;
  return rows.map((row) => ({
    serviceName: row.serviceName,
    pricingUnit: row.pricingUnit,
    quantityMilli: toNumber(row.quantity),
    lineCount: toNumber(row.lines),
    salesCents: toNumber(row.sales),
  }));
}

export type MethodRow = {
  method: PaymentMethod;
  receivedCents: number;
  refundedCents: number;
  netCents: number;
};

export async function getPaymentsByMethod(actor: Actor, range: DateRange): Promise<MethodRow[]> {
  assertReportAccess(actor, range);
  const { timeZone } = await getSettings();
  const { start, endExclusive } = rangeToUtc(range, timeZone);
  const rows = await prisma.$queryRaw<
    { method: PaymentMethod; received: bigint; refunded: bigint }[]
  >`
    SELECT "method",
           COALESCE(SUM("amountCents") FILTER (WHERE "type" = 'PAYMENT'), 0)::bigint AS received,
           COALESCE(SUM("amountCents") FILTER (WHERE "type" = 'REFUND'), 0)::bigint AS refunded
    FROM "Payment"
    WHERE "reversedAt" IS NULL AND "paidAt" >= ${start} AND "paidAt" < ${endExclusive}
    GROUP BY 1
    ORDER BY received DESC`;
  return rows.map((row) => ({
    method: row.method,
    receivedCents: toNumber(row.received),
    refundedCents: toNumber(row.refunded),
    netCents: toNumber(row.received) - toNumber(row.refunded),
  }));
}

export type CategoryRow = { category: string; count: number; amountCents: number };

export async function getExpensesByCategory(
  actor: Actor,
  range: DateRange,
): Promise<CategoryRow[]> {
  assertCan(actor, "expenses:view");
  const rows = await prisma.$queryRaw<{ category: string; count: bigint; amount: bigint }[]>`
    SELECT c."name" AS category, COUNT(*)::bigint AS count, SUM(e."amountCents")::bigint AS amount
    FROM "Expense" e
    JOIN "ExpenseCategory" c ON c."id" = e."categoryId"
    WHERE e."voidedAt" IS NULL
      AND e."expenseDate" >= ${range.from}::date AND e."expenseDate" <= ${range.to}::date
    GROUP BY 1
    ORDER BY amount DESC, category ASC`;
  return rows.map((row) => ({
    category: row.category,
    count: toNumber(row.count),
    amountCents: toNumber(row.amount),
  }));
}

export type OutstandingRow = {
  id: string;
  receiptNumber: string;
  orderDate: Date;
  customerName: string | null;
  customerPhone: string | null;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
};

/** Every order with money still owed, oldest first, regardless of date. */
export async function getOutstandingBalances(actor: Actor): Promise<OutstandingRow[]> {
  if (!can(actor.role, "reports:full") && !can(actor.role, "reports:daily")) {
    throw new ForbiddenError();
  }
  const rows = await prisma.$queryRaw<
    (Omit<OutstandingRow, "totalCents" | "paidCents" | "balanceCents"> & {
      total: number;
      paid: bigint;
    })[]
  >`
    SELECT t."id", t."receiptNumber", t."orderDate",
           c."name" AS "customerName", c."phone" AS "customerPhone",
           t."totalCents" AS total,
           COALESCE(SUM(p."amountCents"), 0)::bigint AS paid
    FROM "LaundryTransaction" t
    LEFT JOIN "Customer" c ON c."id" = t."customerId"
    LEFT JOIN "Payment" p ON p."transactionId" = t."id"
      AND p."type" = 'PAYMENT' AND p."reversedAt" IS NULL
    WHERE t."voidedAt" IS NULL AND t."status" <> 'CANCELLED'
    GROUP BY t."id", c."name", c."phone"
    HAVING t."totalCents" - COALESCE(SUM(p."amountCents"), 0) > 0
    ORDER BY t."orderDate" ASC`;
  return rows.map(({ total, paid, ...row }) => ({
    ...row,
    orderDate: new Date(row.orderDate),
    totalCents: toNumber(total),
    paidCents: toNumber(paid),
    balanceCents: toNumber(total) - toNumber(paid),
  }));
}
