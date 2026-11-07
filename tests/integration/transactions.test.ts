import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/password";
import { saveService } from "@/server/catalog";
import { prisma } from "@/server/db";
import { authenticate } from "@/server/auth";
import { recordPayment, recordRefund, reversePayment } from "@/server/payments";
import {
  createTransaction,
  getTransactionDetail,
  listOrders,
  listTransactions,
  updateOrderStatus,
  updateTransaction,
  voidTransaction,
} from "@/server/transactions";
import { serviceSchema } from "@/lib/validation";
import {
  makeService,
  makeTeam,
  orderInput,
  paymentInput,
  resetDatabase,
} from "../support/fixtures";

let team: Awaited<ReturnType<typeof makeTeam>>;
let wash: Awaited<ReturnType<typeof makeService>>;
let dry: Awaited<ReturnType<typeof makeService>>;

beforeEach(async () => {
  await resetDatabase();
  team = await makeTeam();
  wash = await makeService("Wash", 6500);
  dry = await makeService("Dry", 5000);
});

const twoItems = () => [
  { serviceId: wash.id, quantity: "3.5", unitPrice: "65.00" },
  { serviceId: dry.id, quantity: "2", unitPrice: "50.00" },
];

describe("creating an order", () => {
  it("lets a cashier create an order with several items and computes totals on the server", async () => {
    const created = await createTransaction(
      team.cashier,
      orderInput({ items: twoItems(), discount: "20.00", additionalCharge: "15.50" }),
    );
    expect(created.items).toHaveLength(2);
    expect(created.subtotalCents).toBe(32750); // 227.50 + 100.00
    expect(created.discountCents).toBe(2000);
    expect(created.additionalChargeCents).toBe(1550);
    expect(created.totalCents).toBe(32300);
  });

  it("ignores any total a client tries to send", async () => {
    const input = {
      ...orderInput({ items: twoItems() }),
      totalCents: 1,
      subtotalCents: 1,
    };
    const created = await createTransaction(team.cashier, input);
    expect(created.totalCents).toBe(32750);
  });

  it("rejects a discount larger than the subtotal", async () => {
    await expect(
      createTransaction(team.cashier, orderInput({ items: twoItems(), discount: "9999" })),
    ).rejects.toThrow("discount");
  });

  it("rejects an archived service on a new order", async () => {
    await prisma.service.update({ where: { id: wash.id }, data: { isActive: false } });
    await expect(
      createTransaction(team.cashier, orderInput({ items: twoItems() })),
    ).rejects.toThrow("no longer offered");
  });

  it("rejects an order date in the future", async () => {
    await expect(
      createTransaction(
        team.cashier,
        orderInput({ items: twoItems(), orderDate: "2099-01-01T10:00" }),
      ),
    ).rejects.toThrow("future");
  });

  it("creates a customer once and reuses them", async () => {
    const input = orderInput({
      items: twoItems(),
      customerName: "Ana Cruz",
      customerPhone: "09170000000",
    });
    const first = await createTransaction(team.cashier, input);
    const second = await createTransaction(team.cashier, input);
    expect(first.customerId).toBe(second.customerId);
    expect(await prisma.customer.count()).toBe(1);
  });
});

describe("receipt numbers", () => {
  it("follow the shop day and count up", async () => {
    const first = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    const second = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    expect(first.receiptNumber).toBe("KL-20260310-0001");
    expect(second.receiptNumber).toBe("KL-20260310-0002");
  });

  it("use the Manila date just after midnight", async () => {
    const created = await createTransaction(
      team.cashier,
      orderInput({ items: twoItems(), orderDate: "2026-03-11T00:05" }),
    );
    expect(created.receiptNumber).toBe("KL-20260311-0001");
  });

  it("stay unique under concurrent creation", async () => {
    const created = await Promise.all(
      Array.from({ length: 25 }, () =>
        createTransaction(team.cashier, orderInput({ items: twoItems() })),
      ),
    );
    const numbers = created.map((order) => order.receiptNumber).sort();
    expect(new Set(numbers).size).toBe(25);
    expect(numbers[0]).toBe("KL-20260310-0001");
    expect(numbers[24]).toBe("KL-20260310-0025");
  });
});

describe("price history", () => {
  it("keeps the charged price when the catalog price changes", async () => {
    const order = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    await saveService(
      team.admin,
      wash.id,
      serviceSchema.parse({
        name: "Wash Deluxe",
        pricingUnit: "PER_KG",
        currentPrice: "99.00",
        isActive: true,
      }),
    );
    const detail = await getTransactionDetail(team.admin, order.id);
    const line = detail.items.find((item) => item.serviceId === wash.id);
    expect(line?.unitPriceCents).toBe(6500);
    expect(line?.serviceNameSnapshot).toBe("Wash");
    expect(detail.totalCents).toBe(32750);
  });

  it("keeps the snapshot when an existing line is edited after a rename", async () => {
    const order = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    await prisma.service.update({
      where: { id: wash.id },
      data: { name: "Renamed", isActive: false },
    });
    const edited = await updateTransaction(
      team.admin,
      order.id,
      orderInput({ items: [{ serviceId: wash.id, quantity: "1", unitPrice: "65.00" }] }),
    );
    expect(edited.items[0]?.serviceNameSnapshot).toBe("Wash");
  });
});

describe("editing an order", () => {
  it("recalculates and records the change", async () => {
    const order = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    const edited = await updateTransaction(
      team.admin,
      order.id,
      orderInput({ items: [{ serviceId: dry.id, quantity: "1", unitPrice: "50.00" }] }),
    );
    expect(edited.totalCents).toBe(5000);
    expect(edited.items).toHaveLength(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "transaction.update", entityId: order.id },
    });
    expect(audit.userId).toBe(team.admin.id);
    expect((audit.beforeData as { totalCents: number }).totalCents).toBe(32750);
    expect((audit.afterData as { totalCents: number }).totalCents).toBe(5000);
  });

  it("will not drop the total below what has been paid", async () => {
    const order = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    await recordPayment(team.cashier, order.id, paymentInput("200.00"));
    await expect(
      updateTransaction(
        team.admin,
        order.id,
        orderInput({ items: [{ serviceId: dry.id, quantity: "1", unitPrice: "50.00" }] }),
      ),
    ).rejects.toThrow("less than what has been paid");
  });
});

describe("order status", () => {
  it("lets staff move an order along but not complete it", async () => {
    const order = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    await updateOrderStatus(team.staff, order.id, "WASHING");
    await expect(updateOrderStatus(team.staff, order.id, "COMPLETED")).rejects.toThrow(
      "permission",
    );
  });

  it("stamps completion", async () => {
    const order = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    const done = await updateOrderStatus(team.cashier, order.id, "COMPLETED");
    expect(done.completedAt).toBeInstanceOf(Date);
  });

  it("only cancels through the void flow", async () => {
    const order = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    await expect(updateOrderStatus(team.owner, order.id, "CANCELLED")).rejects.toThrow("Void");
  });
});

describe("voiding", () => {
  it("cancels the order and keeps the reason", async () => {
    const order = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    const voided = await voidTransaction(team.admin, order.id, "Customer changed mind");
    expect(voided.status).toBe("CANCELLED");
    expect(voided.voidReason).toBe("Customer changed mind");
    expect(voided.voidedById).toBe(team.admin.id);
    expect((await getTransactionDetail(team.admin, order.id)).balanceCents).toBe(0);
  });

  it("is blocked while the order holds money, and allowed after a full refund", async () => {
    const order = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    await recordPayment(team.cashier, order.id, paymentInput("100.00"));
    await expect(voidTransaction(team.admin, order.id, "Wrong order")).rejects.toThrow(
      "still holds payments",
    );
    await recordRefund(team.admin, order.id, {
      ...paymentInput("100.00"),
      notes: "Returned to customer",
    });
    await expect(voidTransaction(team.admin, order.id, "Wrong order")).resolves.toBeTruthy();
  });

  it("freezes the order afterwards", async () => {
    const order = await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    await voidTransaction(team.admin, order.id, "Duplicate entry");
    await expect(recordPayment(team.cashier, order.id, paymentInput("1.00"))).rejects.toThrow(
      "voided",
    );
    await expect(
      updateTransaction(team.admin, order.id, orderInput({ items: twoItems() })),
    ).rejects.toThrow("voided");
    await expect(voidTransaction(team.admin, order.id, "Again")).rejects.toThrow("voided");
  });
});

describe("listing", () => {
  it("searches by receipt and customer, and filters by shop-day range", async () => {
    await createTransaction(
      team.cashier,
      orderInput({ items: twoItems(), customerName: "Ana Cruz" }),
    );
    await createTransaction(
      team.cashier,
      orderInput({ items: twoItems(), orderDate: "2026-03-12T10:00" }),
    );
    expect((await listTransactions(team.cashier, { q: "ana" })).total).toBe(1);
    expect((await listTransactions(team.cashier, { q: "20260312" })).total).toBe(1);
    expect(
      (await listTransactions(team.cashier, { from: "2026-03-11", to: "2026-03-12" })).total,
    ).toBe(1);
  });

  describe("sort by", () => {
    /**
     * Ana: paid in full. Ben: partial. Cara: unpaid. Dan: paid, then the payment
     * was reversed, so unpaid again. Walk-in: voided. Each order is a day apart.
     */
    async function makeMixedOrders() {
      const order = (day: number, customerName?: string) =>
        createTransaction(
          team.cashier,
          orderInput({
            items: twoItems(),
            customerName,
            orderDate: `2026-03-${String(day).padStart(2, "0")}T09:00`,
          }),
        );
      const pay = (id: string, day: number, amount: string) =>
        recordPayment(
          team.cashier,
          id,
          paymentInput(amount, { paidAt: `2026-03-${String(day).padStart(2, "0")}T10:00` }),
        );

      const walkIn = await order(9);
      const ana = await order(10, "Ana Cruz");
      const ben = await order(11, "Ben Santos");
      const cara = await order(12, "Cara Lim");
      const dan = await order(13, "Dan Reyes");
      await pay(ana.id, 10, "327.50");
      await pay(ben.id, 11, "100.00");
      const reversed = await pay(dan.id, 13, "327.50");
      await reversePayment(team.admin, reversed.id, "Wrong order");
      await voidTransaction(team.admin, walkIn.id, "Duplicate entry");
      return { walkIn, ana, ben, cara, dan };
    }

    const idsFor = async (sort: string, extra: { q?: string } = {}) => {
      const { rows, total } = await listTransactions(team.cashier, { sort, ...extra });
      return { ids: rows.map((row) => row.id), total };
    };

    it("puts paid in full first, then partial, unpaid, and voided last", async () => {
      const o = await makeMixedOrders();
      const { ids, total } = await idsFor("paid");
      expect(ids).toEqual([o.ana.id, o.ben.id, o.dan.id, o.cara.id, o.walkIn.id]);
      expect(total).toBe(5);
    });

    it("puts unpaid first (counting a reversed payment as unpaid), voided last", async () => {
      const o = await makeMixedOrders();
      const { ids } = await idsFor("unpaid");
      expect(ids).toEqual([o.dan.id, o.cara.id, o.ben.id, o.ana.id, o.walkIn.id]);
    });

    it("sorts by customer name A to Z with walk-ins last", async () => {
      const o = await makeMixedOrders();
      const { ids } = await idsFor("name");
      expect(ids).toEqual([o.ana.id, o.ben.id, o.cara.id, o.dan.id, o.walkIn.id]);
    });

    it("sorts by date newest first", async () => {
      const o = await makeMixedOrders();
      const { ids } = await idsFor("orderDate");
      expect(ids).toEqual([o.dan.id, o.cara.id, o.ben.id, o.ana.id, o.walkIn.id]);
    });

    it("keeps the search filter and balances when sorting by payment", async () => {
      const o = await makeMixedOrders();
      const { rows, total } = await listTransactions(team.cashier, { sort: "unpaid", q: "a" });
      // "a" matches Ana, Cara, Dan and Ben Santos, but not the walk-in.
      expect(total).toBe(4);
      expect(rows.map((row) => row.id)).toEqual([o.dan.id, o.cara.id, o.ben.id, o.ana.id]);
      expect(rows.map((row) => row.balanceCents)).toEqual([32750, 32750, 22750, 0]);
      expect((await idsFor("paid", { q: "nobody" })).total).toBe(0);
    });

    it("never orders staff by payment", async () => {
      const o = await makeMixedOrders();
      const { rows } = await listOrders(team.staff, { sort: "unpaid" });
      expect(rows.map((row) => row.id)).toEqual([
        o.dan.id,
        o.cara.id,
        o.ben.id,
        o.ana.id,
        o.walkIn.id,
      ]);
    });
  });

  it("gives staff no amounts at all", async () => {
    await createTransaction(team.cashier, orderInput({ items: twoItems() }));
    const { rows } = await listOrders(team.staff, {});
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {})).not.toContain("totalCents");
    await expect(listTransactions(team.staff, {})).rejects.toThrow("permission");
    await expect(getTransactionDetail(team.staff, "any")).rejects.toThrow("permission");
  });
});

describe("login", () => {
  const email = "login@test.local";

  beforeEach(async () => {
    await prisma.user.create({
      data: {
        name: "Login",
        email,
        role: "CASHIER",
        passwordHash: await hashPassword("correct horse battery"),
      },
    });
  });

  it("accepts the right password and rejects the wrong one", async () => {
    expect((await authenticate(email, "correct horse battery"))?.role).toBe("CASHIER");
    expect(await authenticate(email, "wrong")).toBeNull();
  });

  it("refuses a deactivated user", async () => {
    await prisma.user.update({ where: { email }, data: { isActive: false } });
    expect(await authenticate(email, "correct horse battery")).toBeNull();
  });

  it("locks after repeated failures, even for the right password", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await authenticate(email, "wrong");
    expect(await authenticate(email, "correct horse battery")).toBeNull();
  });
});
