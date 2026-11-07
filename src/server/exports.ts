import "server-only";
import { dateOnlyToYmd, formatInZone, type DateRange } from "@/lib/dates";
import { toCsv, type CsvCell } from "@/lib/csv";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PRICING_UNIT_LABELS } from "@/lib/labels";
import { centsToDecimal, milliToDecimal, summarizeBalance } from "@/lib/money";
import { can } from "@/lib/permissions";
import { assertCan, type Actor } from "@/server/access";
import { prisma } from "@/server/db";
import { buildExpenseWhere, expenseOrderBy } from "@/server/expenses";
import { buildPaymentWhere, paymentOrderBy } from "@/server/payments";
import {
  assertReportAccess,
  getExpenseTotal,
  getExpensesByCategory,
  getOutstandingBalances,
  getPaymentsByMethod,
  getSalesByService,
  getSalesSummary,
} from "@/server/reports";
import { getSettings } from "@/server/settings";
import { buildTransactionWhere } from "@/server/transactions";

export const EXPORT_KINDS = [
  "summary",
  "sales-by-service",
  "payments-by-method",
  "expenses-by-category",
  "outstanding",
  "transactions",
  "payments",
  "expenses",
] as const;

export type ExportKind = (typeof EXPORT_KINDS)[number];

const money = (cents: number) => centsToDecimal(cents);

async function summaryRows(actor: Actor, range: DateRange): Promise<CsvCell[][]> {
  const summary = await getSalesSummary(actor, range);
  const rows: CsvCell[][] = [
    ["Measure", "Amount"],
    ["Gross sales", money(summary.grossSalesCents)],
    ["Refunds on valid orders", money(summary.refundsOnValidOrdersCents)],
    ["Net sales", money(summary.netSalesCents)],
    ["Orders", summary.orderCount],
    ["Average order", money(summary.averageOrderCents)],
    ["Payments received", money(summary.paymentsReceivedCents)],
    ["Refunds paid", money(summary.refundsPaidCents)],
    ["Collected", money(summary.collectedCents)],
    ["Unpaid on orders in period", money(summary.outstandingForPeriodCents)],
    ["All open balances", money(summary.outstandingAllCents)],
  ];
  if (can(actor.role, "expenses:view")) {
    const expenses = await getExpenseTotal(actor, range);
    rows.push(
      ["Expenses", money(expenses)],
      ["Net cash flow", money(summary.collectedCents - expenses)],
    );
  }
  return rows;
}

async function salesByServiceRows(actor: Actor, range: DateRange): Promise<CsvCell[][]> {
  const [rows, summary] = await Promise.all([
    getSalesByService(actor, range),
    getSalesSummary(actor, range),
  ]);
  return [
    ["Service", "Unit", "Quantity", "Lines", "Sales"],
    ...rows.map((row) => [
      row.serviceName,
      PRICING_UNIT_LABELS[row.pricingUnit],
      milliToDecimal(row.quantityMilli),
      row.lineCount,
      money(row.salesCents),
    ]),
    ["Subtotal", "", "", "", money(summary.subtotalCents)],
    ["Discounts", "", "", "", money(-summary.discountCents)],
    ["Free loads (promo)", "", "", "", money(-summary.promoDiscountCents)],
    ["Additional charges", "", "", "", money(summary.additionalChargeCents)],
    ["Gross sales", "", "", "", money(summary.grossSalesCents)],
  ];
}

async function paymentsByMethodRows(actor: Actor, range: DateRange): Promise<CsvCell[][]> {
  const rows = await getPaymentsByMethod(actor, range);
  const total = (pick: (row: (typeof rows)[number]) => number) =>
    money(rows.reduce((sum, row) => sum + pick(row), 0));
  return [
    ["Method", "Received", "Refunded", "Net collected"],
    ...rows.map((row) => [
      PAYMENT_METHOD_LABELS[row.method],
      money(row.receivedCents),
      money(row.refundedCents),
      money(row.netCents),
    ]),
    [
      "Total",
      total((row) => row.receivedCents),
      total((row) => row.refundedCents),
      total((row) => row.netCents),
    ],
  ];
}

async function expensesByCategoryRows(actor: Actor, range: DateRange): Promise<CsvCell[][]> {
  const rows = await getExpensesByCategory(actor, range);
  return [
    ["Category", "Entries", "Amount"],
    ...rows.map((row) => [row.category, row.count, money(row.amountCents)]),
    ["Total", "", money(rows.reduce((sum, row) => sum + row.amountCents, 0))],
  ];
}

async function outstandingRows(actor: Actor, timeZone: string): Promise<CsvCell[][]> {
  const rows = await getOutstandingBalances(actor);
  return [
    ["Receipt", "Order date", "Customer", "Phone", "Total", "Paid", "Balance"],
    ...rows.map((row) => [
      row.receiptNumber,
      formatInZone(row.orderDate, timeZone, "yyyy-MM-dd"),
      row.customerName,
      row.customerPhone,
      money(row.totalCents),
      money(row.paidCents),
      money(row.balanceCents),
    ]),
    ["Total", "", "", "", "", "", money(rows.reduce((sum, row) => sum + row.balanceCents, 0))],
  ];
}

async function transactionRows(
  actor: Actor,
  range: DateRange,
  timeZone: string,
): Promise<CsvCell[][]> {
  assertCan(actor, "transactions:view");
  assertReportAccess(actor, range);
  const rows = await prisma.laundryTransaction.findMany({
    where: await buildTransactionWhere(range),
    include: {
      customer: { select: { name: true } },
      payments: { select: { type: true, amountCents: true, reversedAt: true } },
    },
    orderBy: [{ orderDate: "asc" }, { id: "asc" }],
  });
  return [
    [
      "Receipt",
      "Order date",
      "Customer",
      "Status",
      "Subtotal",
      "Discount",
      "Free load (promo)",
      "Additional charges",
      "Total",
      "Paid",
      "Balance",
      "Void reason",
    ],
    ...rows.map((row) => {
      const balance = summarizeBalance(row.totalCents, row.payments, row.voidedAt !== null);
      return [
        row.receiptNumber,
        formatInZone(row.orderDate, timeZone, "yyyy-MM-dd HH:mm"),
        row.customer?.name,
        ORDER_STATUS_LABELS[row.status],
        money(row.subtotalCents),
        money(row.discountCents),
        money(row.promoDiscountCents),
        money(row.additionalChargeCents),
        money(row.totalCents),
        money(balance.paidCents),
        money(balance.balanceCents),
        row.voidReason,
      ];
    }),
  ];
}

async function paymentRows(actor: Actor, range: DateRange, timeZone: string): Promise<CsvCell[][]> {
  assertCan(actor, "payments:view");
  assertReportAccess(actor, range);
  const rows = await prisma.payment.findMany({
    where: await buildPaymentWhere(range),
    include: {
      transaction: {
        select: { receiptNumber: true, customer: { select: { name: true } } },
      },
      receivedBy: { select: { name: true } },
    },
    orderBy: paymentOrderBy({ sort: "paidAt", direction: "asc" }),
  });
  return [
    [
      "Date",
      "Type",
      "Receipt",
      "Customer",
      "Method",
      "Amount",
      "Reference",
      "Recorded by",
      "Reversed",
      "Reversal reason",
    ],
    ...rows.map((row) => [
      formatInZone(row.paidAt, timeZone, "yyyy-MM-dd HH:mm"),
      row.type === "PAYMENT" ? "Payment" : "Refund",
      row.transaction.receiptNumber,
      row.transaction.customer?.name,
      PAYMENT_METHOD_LABELS[row.method],
      money(row.amountCents),
      row.referenceNumber,
      row.receivedBy.name,
      row.reversedAt ? "Yes" : "No",
      row.reversalReason,
    ]),
  ];
}

async function expenseRows(actor: Actor, range: DateRange): Promise<CsvCell[][]> {
  assertCan(actor, "expenses:view");
  const rows = await prisma.expense.findMany({
    where: buildExpenseWhere(range),
    include: { category: { select: { name: true } } },
    orderBy: expenseOrderBy({ sort: "expenseDate", direction: "asc" }),
  });
  return [
    ["Date", "Category", "Description", "Payee", "Method", "Amount", "Reference", "Voided"],
    ...rows.map((row) => [
      dateOnlyToYmd(row.expenseDate),
      row.category.name,
      row.description,
      row.payee,
      PAYMENT_METHOD_LABELS[row.paymentMethod],
      money(row.amountCents),
      row.referenceNumber,
      row.voidedAt ? "Yes" : "No",
    ]),
  ];
}

export async function buildExport(actor: Actor, kind: ExportKind, range: DateRange) {
  const { timeZone } = await getSettings();
  const rows = await (async () => {
    switch (kind) {
      case "summary":
        return summaryRows(actor, range);
      case "sales-by-service":
        return salesByServiceRows(actor, range);
      case "payments-by-method":
        return paymentsByMethodRows(actor, range);
      case "expenses-by-category":
        return expensesByCategoryRows(actor, range);
      case "outstanding":
        return outstandingRows(actor, timeZone);
      case "transactions":
        return transactionRows(actor, range, timeZone);
      case "payments":
        return paymentRows(actor, range, timeZone);
      case "expenses":
        return expenseRows(actor, range);
    }
  })();
  return { filename: `${kind}_${range.from}_to_${range.to}.csv`, csv: toCsv(rows) };
}
