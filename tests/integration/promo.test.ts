import { beforeEach, describe, expect, it } from "vitest";
import { serviceSchema } from "@/lib/validation";
import { setCustomerPromoEnabled } from "@/server/catalog";
import { prisma } from "@/server/db";
import { buildExport } from "@/server/exports";
import { recordPayment, recordRefund, reversePayment } from "@/server/payments";
import { getPromoStatuses } from "@/server/promo";
import { getSalesSummary } from "@/server/reports";
import { getSettings, setPromoEnabled } from "@/server/settings";
import {
  createTransaction,
  updateOrderStatus,
  updateTransaction,
  voidTransaction,
} from "@/server/transactions";
import { makeTeam, orderInput, paymentInput, resetDatabase } from "../support/fixtures";

let team: Awaited<ReturnType<typeof makeTeam>>;
let load: { id: string };
let kilo: { id: string };

const customer = { customerName: "Ana Cruz", customerPhone: "09170000000" };

beforeEach(async () => {
  await resetDatabase();
  team = await makeTeam();
  load = await prisma.service.create({
    data: {
      name: "Per load",
      pricingUnit: "PER_LOAD",
      currentPriceCents: 18000,
      promoEligible: true,
    },
  });
  kilo = await prisma.service.create({
    data: { name: "Per kilo", pricingUnit: "PER_KG", currentPriceCents: 6500 },
  });
  await setPromoEnabled(team.owner, true);
});

const loadLine = (quantity = "1") => ({ serviceId: load.id, quantity, unitPrice: "180.00" });

/** Creates, pays, and completes an order of `loads` loads. */
async function paidOrder(loads: number) {
  const order = await createTransaction(
    team.cashier,
    orderInput({ ...customer, items: [loadLine(String(loads))] }),
  );
  const payment = await recordPayment(
    team.cashier,
    order.id,
    paymentInput((order.totalCents / 100).toFixed(2)),
  );
  await updateOrderStatus(team.cashier, order.id, "COMPLETED");
  return { order, payment };
}

async function status(customerId: string | null) {
  if (!customerId) throw new Error("The order has no customer.");
  const statuses = await getPromoStatuses(team.cashier, [customerId]);
  const result = statuses.get(customerId);
  if (!result) throw new Error("No promo status.");
  return result;
}

const freeOrderInput = (quantity = "1") =>
  orderInput({ ...customer, items: [loadLine(quantity)], redeemFreeLoad: true });

describe("the toggle", () => {
  it("is off until someone turns it on, and only managers may", async () => {
    await resetDatabase();
    team = await makeTeam();
    expect((await getSettings()).promoEnabled).toBe(false);
    await expect(setPromoEnabled(team.cashier, true)).rejects.toThrow("permission");
    await setPromoEnabled(team.admin, true);
    expect((await getSettings()).promoEnabled).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "settings.promo" } });
    expect(audit.userId).toBe(team.admin.id);
  });

  it("hides every customer's standing while off, and restores it when back on", async () => {
    const { order } = await paidOrder(3);
    const customerId = order.customerId as string;
    await setPromoEnabled(team.owner, false);
    expect((await getPromoStatuses(team.cashier, [customerId])).size).toBe(0);
    await setPromoEnabled(team.owner, true);
    expect((await status(customerId)).paidLoads).toBe(3);
  });

  it("does not count orders created while off", async () => {
    await setPromoEnabled(team.owner, false);
    const { order } = await paidOrder(10);
    await setPromoEnabled(team.owner, true);
    expect((await status(order.customerId)).paidLoads).toBe(0);
  });
});

describe("the customer switch", () => {
  it("starts on, and only managers may change it, with an audit entry", async () => {
    const { order } = await paidOrder(1);
    const customerId = order.customerId as string;
    expect((await status(customerId)).paidLoads).toBe(1);
    await expect(setCustomerPromoEnabled(team.cashier, customerId, false)).rejects.toThrow(
      "permission",
    );
    await setCustomerPromoEnabled(team.admin, customerId, false);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "customer.promo" } });
    expect(audit.userId).toBe(team.admin.id);
    expect(audit.entityId).toBe(customerId);
  });

  it("hides that customer only, and keeps their count for when it returns", async () => {
    const { order } = await paidOrder(3);
    const customerId = order.customerId as string;
    const other = await prisma.customer.create({ data: { name: "Ben Lim" } });
    await setCustomerPromoEnabled(team.admin, customerId, false);

    const statuses = await getPromoStatuses(team.cashier, [customerId, other.id]);
    expect(statuses.has(customerId)).toBe(false);
    expect(statuses.has(other.id)).toBe(true);

    await setCustomerPromoEnabled(team.admin, customerId, true);
    expect((await status(customerId)).paidLoads).toBe(3);
  });

  it("does not count orders created while it is off", async () => {
    const { order } = await paidOrder(1);
    const customerId = order.customerId as string;
    await setCustomerPromoEnabled(team.admin, customerId, false);
    await paidOrder(10);
    await setCustomerPromoEnabled(team.admin, customerId, true);
    expect((await status(customerId)).paidLoads).toBe(1);
  });

  it("refuses a free load while off, and the shop switch still overrides it", async () => {
    const { order } = await paidOrder(10);
    const customerId = order.customerId as string;
    await setCustomerPromoEnabled(team.admin, customerId, false);
    await expect(createTransaction(team.cashier, freeOrderInput())).rejects.toThrow(
      "off for this customer",
    );

    await setCustomerPromoEnabled(team.admin, customerId, true);
    await setPromoEnabled(team.owner, false);
    expect((await getPromoStatuses(team.cashier, [customerId])).size).toBe(0);
    await expect(createTransaction(team.cashier, freeOrderInput())).rejects.toThrow("promo is off");
  });

  it("lets an order keep a free load it already used", async () => {
    const { order } = await paidOrder(10);
    const free = await createTransaction(team.cashier, freeOrderInput("2"));
    await setCustomerPromoEnabled(team.admin, order.customerId as string, false);
    const edited = await updateTransaction(team.admin, free.id, freeOrderInput("3"));
    expect(edited.promoFreeLoad).toBe(true);
    expect(edited.totalCents).toBe(36000);
  });
});

describe("earning", () => {
  it("earns one free load at 10 paid loads across orders", async () => {
    const { order } = await paidOrder(9);
    expect((await status(order.customerId)).freeLoadsAvailable).toBe(0);
    await paidOrder(1);
    expect((await status(order.customerId)).freeLoadsAvailable).toBe(1);
  });

  it("waits for both payment and completion", async () => {
    const order = await createTransaction(
      team.cashier,
      orderInput({ ...customer, items: [loadLine("10")] }),
    );
    await recordPayment(team.cashier, order.id, paymentInput("1800.00"));
    expect((await status(order.customerId)).paidLoads).toBe(0);
    await updateOrderStatus(team.cashier, order.id, "COMPLETED");
    expect((await status(order.customerId)).paidLoads).toBe(10);
  });

  it("ignores per-kg lines", async () => {
    const order = await createTransaction(
      team.cashier,
      orderInput({
        ...customer,
        items: [{ serviceId: kilo.id, quantity: "20", unitPrice: "65.00" }],
      }),
    );
    await recordPayment(team.cashier, order.id, paymentInput("1300.00"));
    await updateOrderStatus(team.cashier, order.id, "COMPLETED");
    expect((await status(order.customerId)).paidLoads).toBe(0);
  });

  it("stamps only marked services, and an order keeps the mark it was sold with", async () => {
    const comforter = await prisma.service.create({
      data: { name: "Comforter", pricingUnit: "PER_LOAD", currentPriceCents: 35000 },
    });
    const order = await createTransaction(
      team.cashier,
      orderInput({
        ...customer,
        items: [loadLine("2"), { serviceId: comforter.id, quantity: "3", unitPrice: "350.00" }],
      }),
    );
    await recordPayment(team.cashier, order.id, paymentInput("1410.00"));
    await updateOrderStatus(team.cashier, order.id, "COMPLETED");
    expect((await status(order.customerId)).paidLoads).toBe(2);

    await prisma.service.update({ where: { id: load.id }, data: { promoEligible: false } });
    expect((await status(order.customerId)).paidLoads).toBe(2);
  });

  it("will not mark a service that is not priced per load", () => {
    expect(
      serviceSchema.safeParse({
        name: "Wash",
        pricingUnit: "PER_KG",
        currentPrice: "65.00",
        promoEligible: true,
        isActive: true,
      }).success,
    ).toBe(false);
  });

  it("takes the loads back when a payment is reversed or refunded", async () => {
    const first = await paidOrder(10);
    const customerId = first.order.customerId;
    await reversePayment(team.admin, first.payment.id, "Entered twice");
    expect((await status(customerId)).freeLoadsAvailable).toBe(0);

    const second = await paidOrder(10);
    await recordRefund(team.admin, second.order.id, {
      ...paymentInput("1800.00"),
      notes: "Returned to customer",
    });
    expect((await status(customerId)).paidLoads).toBe(0);
  });
});

describe("using a free load", () => {
  it("takes one load off the order and spends the reward", async () => {
    const { order } = await paidOrder(10);
    const free = await createTransaction(team.cashier, freeOrderInput("2"));
    expect(free.customerId).toBe(order.customerId);
    expect(free.subtotalCents).toBe(36000);
    expect(free.discountCents).toBe(0);
    expect(free.promoDiscountCents).toBe(18000);
    expect(free.totalCents).toBe(18000);
    expect((await status(order.customerId)).freeLoadsAvailable).toBe(0);
    await expect(createTransaction(team.cashier, freeOrderInput())).rejects.toThrow(
      "no free load available",
    );
  });

  it("is refused while the promo is off", async () => {
    await paidOrder(10);
    await setPromoEnabled(team.owner, false);
    await expect(createTransaction(team.cashier, freeOrderInput())).rejects.toThrow("promo is off");
  });

  it("is refused for a walk-in and without a load on the order", async () => {
    await expect(
      createTransaction(team.cashier, orderInput({ items: [loadLine()], redeemFreeLoad: true })),
    ).rejects.toThrow("named customer");

    await paidOrder(10);
    await expect(
      createTransaction(
        team.cashier,
        orderInput({
          ...customer,
          items: [{ serviceId: kilo.id, quantity: "5", unitPrice: "65.00" }],
          redeemFreeLoad: true,
        }),
      ),
    ).rejects.toThrow("promo service");
  });

  it("is refused on a per-load service outside the promo", async () => {
    await paidOrder(10);
    const comforter = await prisma.service.create({
      data: { name: "Comforter", pricingUnit: "PER_LOAD", currentPriceCents: 35000 },
    });
    await expect(
      createTransaction(
        team.cashier,
        orderInput({
          ...customer,
          items: [{ serviceId: comforter.id, quantity: "1", unitPrice: "350.00" }],
          redeemFreeLoad: true,
        }),
      ),
    ).rejects.toThrow("promo service");
  });

  it("cannot be spent twice by concurrent orders", async () => {
    await paidOrder(10);
    const results = await Promise.allSettled([
      createTransaction(team.cashier, freeOrderInput()),
      createTransaction(team.cashier, freeOrderInput()),
      createTransaction(team.cashier, freeOrderInput()),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("returns when the order is voided", async () => {
    const { order } = await paidOrder(10);
    const free = await createTransaction(team.cashier, freeOrderInput());
    await voidTransaction(team.admin, free.id, "Wrong customer");
    expect((await status(order.customerId)).freeLoadsAvailable).toBe(1);
  });

  it("survives an edit, even with the promo off, and can be removed", async () => {
    const { order } = await paidOrder(10);
    const free = await createTransaction(team.cashier, freeOrderInput("2"));
    await setPromoEnabled(team.owner, false);
    const edited = await updateTransaction(team.admin, free.id, freeOrderInput("3"));
    expect(edited.promoFreeLoad).toBe(true);
    expect(edited.totalCents).toBe(36000);

    await setPromoEnabled(team.owner, true);
    const removed = await updateTransaction(
      team.admin,
      free.id,
      orderInput({ ...customer, items: [loadLine("3")] }),
    );
    expect(removed.promoFreeLoad).toBe(false);
    expect(removed.promoDiscountCents).toBe(0);
    expect((await status(order.customerId)).freeLoadsAvailable).toBe(1);
  });

  it("is recorded in the audit log", async () => {
    await paidOrder(10);
    const free = await createTransaction(team.cashier, freeOrderInput());
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "transaction.create", entityId: free.id },
    });
    expect((audit.afterData as { promoFreeLoad: boolean }).promoFreeLoad).toBe(true);
    expect((audit.afterData as { promoDiscountCents: number }).promoDiscountCents).toBe(18000);
  });
});

describe("the automatic free load", () => {
  const nextOrder = (values: Parameters<typeof orderInput>[0]) =>
    createTransaction(team.cashier, orderInput({ ...customer, ...values }));

  it("goes on the next order by itself once 10 loads across visits are paid", async () => {
    let customerId: string | null = null;
    for (let visit = 0; visit < 10; visit += 1) {
      const { order } = await paidOrder(1);
      expect(order.promoFreeLoad).toBe(false);
      customerId = order.customerId;
    }
    expect((await status(customerId)).freeLoadsAvailable).toBe(1);

    const free = await nextOrder({ items: [loadLine()] });
    expect(free.promoFreeLoad).toBe(true);
    expect(free.promoDiscountCents).toBe(18000);
    expect(free.totalCents).toBe(0);
    expect((await status(customerId)).freeLoadsAvailable).toBe(0);

    const after = await nextOrder({ items: [loadLine()] });
    expect(after.promoFreeLoad).toBe(false);
    expect(after.totalCents).toBe(18000);
  });

  it("earns the next one from paid loads, not from the free load", async () => {
    const { order } = await paidOrder(10);
    const free = await nextOrder({ items: [loadLine("2")] });
    await recordPayment(team.cashier, free.id, paymentInput("180.00"));
    await updateOrderStatus(team.cashier, free.id, "COMPLETED");
    expect(await status(order.customerId)).toMatchObject({ paidLoads: 11, progress: 1 });

    await paidOrder(9);
    expect((await status(order.customerId)).freeLoadsAvailable).toBe(1);
  });

  it("stays with the customer when the cashier saves it", async () => {
    const { order } = await paidOrder(10);
    const saved = await nextOrder({ items: [loadLine()], redeemFreeLoad: false });
    expect(saved.promoFreeLoad).toBe(false);
    expect(saved.totalCents).toBe(18000);
    expect((await status(order.customerId)).freeLoadsAvailable).toBe(1);
  });

  it("does not hold up an order with no promo load, and waits for one", async () => {
    await paidOrder(10);
    const kiloOrder = await nextOrder({
      items: [{ serviceId: kilo.id, quantity: "5", unitPrice: "65.00" }],
    });
    expect(kiloOrder.promoFreeLoad).toBe(false);
    expect(kiloOrder.totalCents).toBe(32500);
    expect((await nextOrder({ items: [loadLine()] })).promoFreeLoad).toBe(true);
  });

  it("does not hold up an order when the discount leaves no room", async () => {
    const { order } = await paidOrder(10);
    const discounted = await nextOrder({ items: [loadLine()], discount: "50.00" });
    expect(discounted.promoFreeLoad).toBe(false);
    expect(discounted.totalCents).toBe(13000);
    expect((await status(order.customerId)).freeLoadsAvailable).toBe(1);
  });

  it("skips anyone the promo is off for, and walk-ins", async () => {
    const { order } = await paidOrder(10);
    await setCustomerPromoEnabled(team.admin, order.customerId as string, false);
    expect((await nextOrder({ items: [loadLine()] })).promoFreeLoad).toBe(false);

    await setCustomerPromoEnabled(team.admin, order.customerId as string, true);
    await setPromoEnabled(team.owner, false);
    expect((await nextOrder({ items: [loadLine()] })).promoFreeLoad).toBe(false);

    await setPromoEnabled(team.owner, true);
    const walkIn = await createTransaction(team.cashier, orderInput({ items: [loadLine()] }));
    expect(walkIn.promoFreeLoad).toBe(false);
  });

  it("does not change an existing order when it is edited", async () => {
    const earlier = await nextOrder({ items: [loadLine()] });
    await paidOrder(10);
    const edited = await updateTransaction(
      team.admin,
      earlier.id,
      orderInput({ ...customer, items: [loadLine("2")] }),
    );
    expect(edited.promoFreeLoad).toBe(false);
    expect(edited.totalCents).toBe(36000);
  });

  it("is spent once by concurrent orders, and none of them fail", async () => {
    await paidOrder(10);
    const results = await Promise.all([
      nextOrder({ items: [loadLine()] }),
      nextOrder({ items: [loadLine()] }),
      nextOrder({ items: [loadLine()] }),
    ]);
    expect(results.filter((order) => order.promoFreeLoad)).toHaveLength(1);
  });
});

describe("reports", () => {
  const day = { from: "2026-03-10", to: "2026-03-10" };

  it("reconciles a free load, on screen and in the CSV", async () => {
    await paidOrder(10);
    await createTransaction(team.cashier, freeOrderInput("2"));
    const summary = await getSalesSummary(team.owner, day);
    expect(summary.promoDiscountCents).toBe(18000);
    expect(summary.grossSalesCents).toBe(
      summary.subtotalCents -
        summary.discountCents -
        summary.promoDiscountCents +
        summary.additionalChargeCents,
    );
    const { csv } = await buildExport(team.owner, "sales-by-service", day);
    expect(csv).toContain("Free loads (promo)");
    expect(csv).toContain("-180.00");
  });
});
