import { beforeEach, describe, expect, it } from "vitest";
import { expenseSchema } from "@/lib/validation";
import { prisma } from "@/server/db";
import { createExpense, updateExpense, voidExpense } from "@/server/expenses";
import { buildExport } from "@/server/exports";
import { recordPayment, recordRefund, reversePayment } from "@/server/payments";
import {
  getExpenseTotal,
  getExpensesByCategory,
  getOutstandingBalances,
  getPaymentsByMethod,
  getSalesByService,
  getSalesSummary,
  getTrend,
} from "@/server/reports";
import { createTransaction, voidTransaction } from "@/server/transactions";
import {
  makeCategory,
  makeService,
  makeTeam,
  orderInput,
  paymentInput,
  resetDatabase,
} from "../support/fixtures";

let team: Awaited<ReturnType<typeof makeTeam>>;
let wash: Awaited<ReturnType<typeof makeService>>;
let rent: Awaited<ReturnType<typeof makeCategory>>;

const MARCH_10 = { from: "2026-03-10", to: "2026-03-10" };
const MARCH_11 = { from: "2026-03-11", to: "2026-03-11" };

function order(amount: string, orderDate = "2026-03-10T10:00") {
  return createTransaction(
    team.cashier,
    orderInput({ items: [{ serviceId: wash.id, quantity: "1", unitPrice: amount }], orderDate }),
  );
}

function expense(amount: string, expenseDate: string, description = "Monthly rent") {
  return expenseSchema.parse({
    categoryId: rent.id,
    description,
    amount,
    expenseDate,
    paymentMethod: "CASH",
  });
}

beforeEach(async () => {
  await resetDatabase();
  team = await makeTeam();
  wash = await makeService("Wash", 10000);
  rent = await makeCategory();
});

describe("sales and collections", () => {
  it("does not count a partial payment as a second sale", async () => {
    const created = await order("500.00");
    await recordPayment(team.cashier, created.id, paymentInput("200.00"));
    await recordPayment(team.cashier, created.id, paymentInput("100.00"));
    const summary = await getSalesSummary(team.owner, MARCH_10);
    expect(summary.grossSalesCents).toBe(50000);
    expect(summary.orderCount).toBe(1);
    expect(summary.collectedCents).toBe(30000);
    expect(summary.outstandingForPeriodCents).toBe(20000);
  });

  it("dates sales by order date and collections by payment date", async () => {
    const created = await order("500.00", "2026-03-10T10:00");
    await recordPayment(
      team.cashier,
      created.id,
      paymentInput("500.00", { paidAt: "2026-03-11T09:00" }),
    );
    const orderDay = await getSalesSummary(team.owner, MARCH_10);
    const paymentDay = await getSalesSummary(team.owner, MARCH_11);
    expect(orderDay.grossSalesCents).toBe(50000);
    expect(orderDay.collectedCents).toBe(0);
    expect(paymentDay.grossSalesCents).toBe(0);
    expect(paymentDay.collectedCents).toBe(50000);
  });

  it("excludes a reversed payment from collected totals", async () => {
    const created = await order("500.00");
    await recordPayment(team.cashier, created.id, paymentInput("100.00"));
    const wrong = await recordPayment(team.cashier, created.id, paymentInput("200.00"));
    await reversePayment(team.admin, wrong.id, "Keyed twice");
    const summary = await getSalesSummary(team.owner, MARCH_10);
    expect(summary.collectedCents).toBe(10000);
    expect(summary.outstandingForPeriodCents).toBe(40000);
    expect((await getPaymentsByMethod(team.owner, MARCH_10))[0]?.receivedCents).toBe(10000);
  });

  it("excludes a voided order from sales and balances", async () => {
    const kept = await order("100.00");
    const voided = await order("500.00");
    await voidTransaction(team.admin, voided.id, "Duplicate");
    const summary = await getSalesSummary(team.owner, MARCH_10);
    expect(summary.grossSalesCents).toBe(10000);
    expect(summary.orderCount).toBe(1);
    expect(summary.outstandingAllCents).toBe(10000);
    expect((await getOutstandingBalances(team.owner)).map((row) => row.id)).toEqual([kept.id]);
    expect((await getSalesByService(team.owner, MARCH_10))[0]?.salesCents).toBe(10000);
  });

  it("dates a refund to when it was paid and leaves the sale day alone", async () => {
    const created = await order("500.00");
    await recordPayment(team.cashier, created.id, paymentInput("500.00"));
    await recordRefund(team.admin, created.id, {
      ...paymentInput("100.00", { paidAt: "2026-03-11T10:00" }),
      notes: "Damaged item",
    });
    const saleDay = await getSalesSummary(team.owner, MARCH_10);
    const refundDay = await getSalesSummary(team.owner, MARCH_11);
    expect(saleDay.collectedCents).toBe(50000);
    expect(saleDay.netSalesCents).toBe(50000);
    expect(refundDay.collectedCents).toBe(-10000);
    expect(refundDay.netSalesCents).toBe(-10000);
    expect(refundDay.grossSalesCents).toBe(0);
  });

  it("does not take a voided order's refund off net sales twice", async () => {
    const created = await order("500.00");
    await recordPayment(team.cashier, created.id, paymentInput("500.00"));
    await recordRefund(team.admin, created.id, { ...paymentInput("500.00"), notes: "Full refund" });
    await voidTransaction(team.admin, created.id, "Cancelled");
    const summary = await getSalesSummary(team.owner, MARCH_10);
    expect(summary.grossSalesCents).toBe(0);
    expect(summary.netSalesCents).toBe(0);
    expect(summary.collectedCents).toBe(0);
  });

  it("reconciles sales by service to gross sales", async () => {
    await createTransaction(
      team.cashier,
      orderInput({
        items: [{ serviceId: wash.id, quantity: "2.5", unitPrice: "100.00" }],
        discount: "30.00",
        additionalCharge: "10.00",
      }),
    );
    const rows = await getSalesByService(team.owner, MARCH_10);
    const summary = await getSalesSummary(team.owner, MARCH_10);
    expect(rows[0]).toMatchObject({ quantityMilli: 2500, salesCents: 25000 });
    expect(rows[0]!.salesCents - summary.discountCents + summary.additionalChargeCents).toBe(
      summary.grossSalesCents,
    );
  });
});

describe("Asia/Manila day boundaries", () => {
  it("puts 00:00 in the new day and 23:59 in the old one", async () => {
    await order("100.00", "2026-03-10T00:00");
    await order("200.00", "2026-03-10T23:59");
    await order("400.00", "2026-03-11T00:00");
    expect((await getSalesSummary(team.owner, MARCH_10)).grossSalesCents).toBe(30000);
    expect((await getSalesSummary(team.owner, MARCH_11)).grossSalesCents).toBe(40000);
  });

  it("applies the same boundary to payments", async () => {
    const created = await order("500.00", "2026-03-09T10:00");
    await recordPayment(
      team.cashier,
      created.id,
      paymentInput("50.00", { paidAt: "2026-03-10T23:59" }),
    );
    await recordPayment(
      team.cashier,
      created.id,
      paymentInput("70.00", { paidAt: "2026-03-11T00:00" }),
    );
    expect((await getSalesSummary(team.owner, MARCH_10)).collectedCents).toBe(5000);
    expect((await getSalesSummary(team.owner, MARCH_11)).collectedCents).toBe(7000);
  });

  it("buckets the trend by shop day, not UTC day", async () => {
    await order("100.00", "2026-03-11T02:00"); // still March 10 in UTC
    const trend = await getTrend(team.owner, { from: "2026-03-10", to: "2026-03-11" }, "day");
    expect(trend).toEqual([
      { key: "2026-03-10", salesCents: 0, collectedCents: 0 },
      { key: "2026-03-11", salesCents: 10000, collectedCents: 0 },
    ]);
  });

  it("follows the configured time zone", async () => {
    await prisma.shopSettings.upsert({
      where: { id: 1 },
      update: { timeZone: "UTC" },
      create: { id: 1, timeZone: "UTC" },
    });
    await order("100.00", "2026-03-10T23:30");
    expect((await getSalesSummary(team.owner, MARCH_10)).grossSalesCents).toBe(10000);
    expect((await getSalesSummary(team.owner, MARCH_11)).grossSalesCents).toBe(0);
  });
});

describe("expenses", () => {
  it("appears in the report for its expense date", async () => {
    await createExpense(team.admin, expense("1500.00", "2026-03-10"));
    expect(await getExpenseTotal(team.owner, MARCH_10)).toBe(150000);
    expect(await getExpenseTotal(team.owner, MARCH_11)).toBe(0);
    expect(await getExpensesByCategory(team.owner, MARCH_10)).toEqual([
      { category: "Rent", count: 1, amountCents: 150000 },
    ]);
  });

  it("drops out when voided, and keeps the record", async () => {
    const created = await createExpense(team.admin, expense("1500.00", "2026-03-10"));
    await voidExpense(team.admin, created.id, "Entered twice");
    expect(await getExpenseTotal(team.owner, MARCH_10)).toBe(0);
    const stored = await prisma.expense.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.voidReason).toBe("Entered twice");
  });

  it("moves between reports when its date is edited", async () => {
    const created = await createExpense(team.admin, expense("1500.00", "2026-03-10"));
    await updateExpense(team.admin, created.id, expense("1500.00", "2026-03-11"));
    expect(await getExpenseTotal(team.owner, MARCH_10)).toBe(0);
    expect(await getExpenseTotal(team.owner, MARCH_11)).toBe(150000);
  });
});

describe("net cash flow", () => {
  it("equals collected minus expenses, and appears in the export", async () => {
    const created = await order("500.00");
    await recordPayment(team.cashier, created.id, paymentInput("300.00"));
    await createExpense(team.admin, expense("120.00", "2026-03-10"));

    const summary = await getSalesSummary(team.owner, MARCH_10);
    const expenses = await getExpenseTotal(team.owner, MARCH_10);
    expect(summary.collectedCents - expenses).toBe(18000);

    const { csv } = await buildExport(team.owner, "summary", MARCH_10);
    expect(csv).toContain("Net cash flow,180.00");
  });
});

describe("CSV exports", () => {
  it("match the selected dates and displayed totals", async () => {
    const inRange = await order("500.00");
    await order("999.00", "2026-03-11T10:00");
    await recordPayment(team.cashier, inRange.id, paymentInput("120.50", { method: "GCASH" }));
    await createExpense(team.admin, expense("80.00", "2026-03-10"));
    await createExpense(team.admin, expense("90.00", "2026-03-11"));

    const transactions = await buildExport(team.owner, "transactions", MARCH_10);
    expect(transactions.csv).toContain("KL-20260310-0001");
    expect(transactions.csv).not.toContain("KL-20260311-0001");
    expect(transactions.filename).toBe("transactions_2026-03-10_to_2026-03-10.csv");

    const methods = await buildExport(team.owner, "payments-by-method", MARCH_10);
    expect(methods.csv).toContain("GCash,120.50,0.00,120.50");
    expect(methods.csv).toContain("Total,120.50,0.00,120.50");

    const service = await buildExport(team.owner, "sales-by-service", MARCH_10);
    expect(service.csv).toContain("Gross sales,,,,500.00");

    const categories = await buildExport(team.owner, "expenses-by-category", MARCH_10);
    expect(categories.csv).toContain("Total,,80.00");

    const summary = await getSalesSummary(team.owner, MARCH_10);
    const summaryCsv = (await buildExport(team.owner, "summary", MARCH_10)).csv;
    expect(summaryCsv).toContain(`Gross sales,${(summary.grossSalesCents / 100).toFixed(2)}`);
    expect(summaryCsv).toContain(`Collected,${(summary.collectedCents / 100).toFixed(2)}`);
  });

  it("escapes formulas in customer-supplied text", async () => {
    await createTransaction(
      team.cashier,
      orderInput({
        items: [{ serviceId: wash.id, quantity: "1", unitPrice: "10.00" }],
        customerName: "=HYPERLINK(1)",
      }),
    );
    const { csv } = await buildExport(team.owner, "transactions", MARCH_10);
    expect(csv).toContain("'=HYPERLINK(1)");
  });
});

describe("access to reports", () => {
  it("gives a cashier one day at a time and no expenses", async () => {
    await expect(getSalesSummary(team.cashier, MARCH_10)).resolves.toBeTruthy();
    await expect(
      getSalesSummary(team.cashier, { from: "2026-03-01", to: "2026-03-31" }),
    ).rejects.toThrow("permission");
    await expect(getExpenseTotal(team.cashier, MARCH_10)).rejects.toThrow("permission");
    await expect(buildExport(team.cashier, "expenses", MARCH_10)).rejects.toThrow("permission");
    const { csv } = await buildExport(team.cashier, "summary", MARCH_10);
    expect(csv).not.toContain("Expenses");
    expect(csv).not.toContain("Net cash flow");
  });

  it("gives staff nothing", async () => {
    await expect(getSalesSummary(team.staff, MARCH_10)).rejects.toThrow("permission");
    await expect(getOutstandingBalances(team.staff)).rejects.toThrow("permission");
    await expect(buildExport(team.staff, "summary", MARCH_10)).rejects.toThrow("permission");
    await expect(buildExport(team.staff, "payments", MARCH_10)).rejects.toThrow("permission");
  });
});
