import { describe, expect, it } from "vitest";
import { calculateTotals } from "@/lib/money";
import {
  freeLoadFits,
  freeLoadPriceCents,
  paidLoadsOnOrder,
  summarizePromo,
  type PromoOrder,
} from "@/lib/promo";

function order(values: Partial<PromoOrder> & { loads?: number } = {}): PromoOrder {
  const { loads = 1, ...rest } = values;
  return {
    status: "COMPLETED",
    totalCents: 18000,
    voidedAt: null,
    promoEarning: true,
    promoFreeLoad: false,
    items: [{ promoEligibleSnapshot: true, quantityMilli: loads * 1000 }],
    payments: [{ type: "PAYMENT", amountCents: 18000, reversedAt: null }],
    ...rest,
  };
}

describe("paidLoadsOnOrder", () => {
  it("counts whole loads on a completed, fully paid order", () => {
    expect(paidLoadsOnOrder(order({ loads: 3 }))).toBe(3);
  });

  it.each([
    ["not completed", order({ status: "READY_FOR_PICKUP" })],
    ["voided", order({ voidedAt: new Date() })],
    ["created while the promo was off", order({ promoEarning: false })],
    ["unpaid", order({ payments: [] })],
    ["part paid", order({ payments: [{ type: "PAYMENT", amountCents: 100, reversedAt: null }] })],
    ["free of charge", order({ totalCents: 0, payments: [] })],
    [
      "paid by a reversed payment",
      order({ payments: [{ type: "PAYMENT", amountCents: 18000, reversedAt: new Date() }] }),
    ],
    [
      "refunded",
      order({
        payments: [
          { type: "PAYMENT", amountCents: 18000, reversedAt: null },
          { type: "REFUND", amountCents: 100, reversedAt: null },
        ],
      }),
    ],
  ])("ignores an order that is %s", (_label, value) => {
    expect(paidLoadsOnOrder(value)).toBe(0);
  });

  it("ignores services outside the promo, and part loads", () => {
    const items: PromoOrder["items"] = [
      { promoEligibleSnapshot: false, quantityMilli: 8000 },
      { promoEligibleSnapshot: false, quantityMilli: 2000 },
      { promoEligibleSnapshot: true, quantityMilli: 1500 },
    ];
    expect(paidLoadsOnOrder(order({ items }))).toBe(1);
  });

  it("does not count the free load itself", () => {
    expect(paidLoadsOnOrder(order({ loads: 3, promoFreeLoad: true }))).toBe(2);
    expect(paidLoadsOnOrder(order({ loads: 1, promoFreeLoad: true }))).toBe(0);
  });
});

describe("summarizePromo", () => {
  it("starts empty", () => {
    expect(summarizePromo([])).toEqual({
      paidLoads: 0,
      freeLoadsEarned: 0,
      freeLoadsUsed: 0,
      freeLoadsAvailable: 0,
      progress: 0,
    });
  });

  it("earns nothing at 9 loads and one free load at 10", () => {
    expect(summarizePromo([order({ loads: 9 })]).freeLoadsAvailable).toBe(0);
    const ten = summarizePromo([order({ loads: 9 }), order()]);
    expect(ten.freeLoadsAvailable).toBe(1);
    expect(ten.progress).toBe(0);
  });

  it("spends a free load once, and keeps counting", () => {
    const summary = summarizePromo([
      order({ loads: 10 }),
      order({ loads: 3, promoFreeLoad: true }),
    ]);
    expect(summary).toMatchObject({
      paidLoads: 12,
      freeLoadsEarned: 1,
      freeLoadsUsed: 1,
      freeLoadsAvailable: 0,
      progress: 2,
    });
  });

  it("gives a free load back when the order that used it is voided", () => {
    const summary = summarizePromo([
      order({ loads: 10 }),
      order({ promoFreeLoad: true, voidedAt: new Date() }),
    ]);
    expect(summary.freeLoadsAvailable).toBe(1);
  });

  it("never reports fewer than zero available", () => {
    const summary = summarizePromo([order({ loads: 2, promoFreeLoad: true })]);
    expect(summary.freeLoadsAvailable).toBe(0);
  });
});

describe("freeLoadPriceCents", () => {
  it("picks the cheapest whole load", () => {
    expect(
      freeLoadPriceCents([
        { promoEligible: true, quantityMilli: 1000, unitPriceCents: 35000 },
        { promoEligible: true, quantityMilli: 2000, unitPriceCents: 18000 },
        { promoEligible: false, quantityMilli: 5000, unitPriceCents: 6500 },
      ]),
    ).toBe(18000);
  });

  it("is null without a whole load", () => {
    expect(
      freeLoadPriceCents([
        { promoEligible: true, quantityMilli: 500, unitPriceCents: 18000 },
        { promoEligible: false, quantityMilli: 5000, unitPriceCents: 6500 },
      ]),
    ).toBeNull();
  });
});

describe("freeLoadFits", () => {
  const load = { promoEligible: true, quantityMilli: 1000, unitPriceCents: 18000 };

  it("fits a load with no discount, or with exactly enough room left", () => {
    expect(freeLoadFits([load], 0)).toBe(true);
    expect(freeLoadFits([{ ...load, quantityMilli: 2000 }], 18000)).toBe(true);
  });

  it("does not fit without a whole load, or when the discount leaves no room", () => {
    expect(freeLoadFits([{ ...load, promoEligible: false }], 0)).toBe(false);
    expect(freeLoadFits([{ ...load, quantityMilli: 500 }], 0)).toBe(false);
    expect(freeLoadFits([load], 1)).toBe(false);
  });
});

describe("calculateTotals with a free load", () => {
  const lines = [{ quantityMilli: 2000, unitPriceCents: 18000 }];

  it("comes off before additional charges", () => {
    expect(calculateTotals(lines, 1000, 500, 18000).totalCents).toBe(17500);
  });

  it("cannot take the discounts past the subtotal", () => {
    expect(() => calculateTotals(lines, 20000, 0, 18000)).toThrow("subtotal");
  });
});
