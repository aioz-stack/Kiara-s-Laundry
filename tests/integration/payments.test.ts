import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { recordPayment, recordRefund, reversePayment } from "@/server/payments";
import { createTransaction, getTransactionDetail } from "@/server/transactions";
import {
  makeService,
  makeTeam,
  orderInput,
  paymentInput,
  resetDatabase,
} from "../support/fixtures";

let team: Awaited<ReturnType<typeof makeTeam>>;
let orderId: string;

const balance = async () => (await getTransactionDetail(team.owner, orderId)).balanceCents;
const refundInput = (amount: string) => ({ ...paymentInput(amount), notes: "Damaged item" });

beforeEach(async () => {
  await resetDatabase();
  team = await makeTeam();
  const service = await makeService("Wash", 10000);
  const order = await createTransaction(
    team.cashier,
    orderInput({ items: [{ serviceId: service.id, quantity: "5", unitPrice: "100.00" }] }),
  );
  orderId = order.id; // total 500.00
});

describe("payments", () => {
  it("settles an order over several partial payments", async () => {
    expect(await balance()).toBe(50000);
    await recordPayment(team.cashier, orderId, paymentInput("200.00"));
    expect(await balance()).toBe(30000);
    await recordPayment(team.cashier, orderId, paymentInput("120.50", { method: "GCASH" }));
    expect(await balance()).toBe(17950);
    await recordPayment(team.cashier, orderId, paymentInput("179.50", { method: "MAYA" }));
    expect(await balance()).toBe(0);
    expect((await getTransactionDetail(team.owner, orderId)).payments).toHaveLength(3);
  });

  it("refuses to overpay", async () => {
    await recordPayment(team.cashier, orderId, paymentInput("400.00"));
    await expect(recordPayment(team.cashier, orderId, paymentInput("100.01"))).rejects.toThrow(
      "₱100.00",
    );
  });

  it("cannot be overpaid by two cashiers at the same moment", async () => {
    const results = await Promise.allSettled([
      recordPayment(team.cashier, orderId, paymentInput("300.00")),
      recordPayment(team.cashier, orderId, paymentInput("300.00")),
      recordPayment(team.cashier, orderId, paymentInput("300.00")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await balance()).toBe(20000);
  });

  it("refuses a payment date in the future", async () => {
    await expect(
      recordPayment(team.cashier, orderId, paymentInput("1.00", { paidAt: "2099-01-01T10:00" })),
    ).rejects.toThrow("future");
  });

  it("records who received the money", async () => {
    const payment = await recordPayment(team.cashier, orderId, paymentInput("1.00"));
    expect(payment.receivedById).toBe(team.cashier.id);
  });
});

describe("reversals", () => {
  it("keeps the row, restores the balance, and records who and why", async () => {
    const payment = await recordPayment(team.cashier, orderId, paymentInput("200.00"));
    await reversePayment(team.admin, payment.id, "Wrong amount keyed");
    expect(await balance()).toBe(50000);

    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.amountCents).toBe(20000);
    expect(stored.reversedById).toBe(team.admin.id);
    expect(stored.reversalReason).toBe("Wrong amount keyed");

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "payment.reverse" } });
    expect(audit.reason).toBe("Wrong amount keyed");
    expect(audit.userId).toBe(team.admin.id);
  });

  it("cannot be repeated", async () => {
    const payment = await recordPayment(team.cashier, orderId, paymentInput("200.00"));
    await reversePayment(team.admin, payment.id, "Wrong amount");
    await expect(reversePayment(team.admin, payment.id, "Again")).rejects.toThrow("already");
  });

  it("is not available to cashiers", async () => {
    const payment = await recordPayment(team.cashier, orderId, paymentInput("200.00"));
    await expect(reversePayment(team.cashier, payment.id, "Nope")).rejects.toThrow("permission");
  });

  it("cannot strand a refund without its payment", async () => {
    const payment = await recordPayment(team.cashier, orderId, paymentInput("200.00"));
    const refund = await recordRefund(team.admin, orderId, refundInput("50.00"));
    await expect(reversePayment(team.admin, payment.id, "Mistake")).rejects.toThrow(
      "Reverse the refund first",
    );
    await reversePayment(team.admin, refund.id, "Mistake");
    await expect(reversePayment(team.admin, payment.id, "Mistake")).resolves.toBeTruthy();
  });
});

describe("refunds", () => {
  it("lowers money kept without creating a balance", async () => {
    await recordPayment(team.cashier, orderId, paymentInput("500.00"));
    await recordRefund(team.admin, orderId, refundInput("100.00"));
    const detail = await getTransactionDetail(team.owner, orderId);
    expect(detail.netPaidCents).toBe(40000);
    expect(detail.balanceCents).toBe(0);
  });

  it("cannot exceed the money kept on the order", async () => {
    await recordPayment(team.cashier, orderId, paymentInput("100.00"));
    await expect(recordRefund(team.admin, orderId, refundInput("100.01"))).rejects.toThrow(
      "₱100.00",
    );
  });

  it("is not available to cashiers", async () => {
    await recordPayment(team.cashier, orderId, paymentInput("100.00"));
    await expect(recordRefund(team.cashier, orderId, refundInput("1.00"))).rejects.toThrow(
      "permission",
    );
  });
});

describe("database guards", () => {
  it("rejects a non-positive payment even if the app were bypassed", async () => {
    await expect(
      prisma.payment.create({
        data: {
          transactionId: orderId,
          amountCents: 0,
          method: "CASH",
          paidAt: new Date(),
          receivedById: team.cashier.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a stored total that does not add up", async () => {
    await expect(
      prisma.laundryTransaction.update({ where: { id: orderId }, data: { totalCents: 1 } }),
    ).rejects.toThrow();
  });
});
