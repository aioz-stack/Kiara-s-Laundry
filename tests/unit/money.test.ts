import { describe, expect, it } from "vitest";
import {
  calculateLineTotal,
  calculateTotals,
  centsToDecimal,
  formatMoney,
  InvalidTotalsError,
  milliToDecimal,
  parseMoneyToCents,
  parseQuantityToMilli,
  summarizeBalance,
} from "@/lib/money";

describe("parseMoneyToCents", () => {
  it.each([
    ["0", 0],
    ["1250", 125000],
    ["1,250.50", 125050],
    ["0.07", 7],
    ["19.99", 1999],
    ["1.1", 110],
    [" 5.00 ", 500],
  ])("parses %s", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it("avoids the floating-point error of multiplying by 100", () => {
    expect(19.99 * 100).not.toBe(1999);
    expect(parseMoneyToCents("19.99")).toBe(1999);
  });

  it.each(["", "abc", "-5", "1.234", "1e5", "1.2.3", "NaN", "9999999999"])(
    "rejects %j",
    (input) => {
      expect(parseMoneyToCents(input)).toBeNull();
    },
  );
});

describe("parseQuantityToMilli", () => {
  it("parses decimals", () => {
    expect(parseQuantityToMilli("3.5")).toBe(3500);
    expect(parseQuantityToMilli("0.125")).toBe(125);
    expect(parseQuantityToMilli("2")).toBe(2000);
  });

  it("rejects bad input", () => {
    expect(parseQuantityToMilli("1.2345")).toBeNull();
    expect(parseQuantityToMilli("-1")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats pesos", () => {
    expect(formatMoney(125000)).toBe("₱1,250.00");
    expect(formatMoney(5)).toBe("₱0.05");
    expect(formatMoney(-150)).toBe("-₱1.50");
    expect(formatMoney(100000000)).toBe("₱1,000,000.00");
  });

  it("converts to plain decimals", () => {
    expect(centsToDecimal(125050)).toBe("1250.50");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(-150)).toBe("-1.50");
    expect(milliToDecimal(3500)).toBe("3.5");
    expect(milliToDecimal(2000)).toBe("2");
    expect(milliToDecimal(125)).toBe("0.125");
  });
});

describe("calculateLineTotal", () => {
  it("multiplies quantity by price", () => {
    expect(calculateLineTotal(3500, 6500)).toBe(22750); // 3.5 kg at 65.00
  });

  it("rounds half up to the centavo", () => {
    expect(calculateLineTotal(1500, 3)).toBe(5); // 4.5 rounds to 5
    expect(calculateLineTotal(1499, 3)).toBe(4); // 4.497 rounds to 4
    expect(calculateLineTotal(333, 100)).toBe(33); // 33.3 rounds to 33
  });

  it("stays exact at the largest allowed values", () => {
    expect(calculateLineTotal(9_999_999, 10_000_000)).toBe(99_999_990_000);
  });
});

describe("calculateTotals", () => {
  const lines = [
    { quantityMilli: 2000, unitPriceCents: 5000 },
    { quantityMilli: 1000, unitPriceCents: 7500 },
  ];

  it("applies the discount before adding charges", () => {
    expect(calculateTotals(lines, 2500, 1000)).toEqual({
      lineTotalsCents: [10000, 7500],
      subtotalCents: 17500,
      discountCents: 2500,
      additionalChargeCents: 1000,
      totalCents: 16000,
    });
  });

  it("rejects a discount above the subtotal", () => {
    expect(() => calculateTotals(lines, 17501, 0)).toThrow(InvalidTotalsError);
  });

  it("rejects a total above the limit", () => {
    expect(() => calculateTotals(lines, 0, 1_000_000_000)).toThrow(InvalidTotalsError);
  });
});

describe("summarizeBalance", () => {
  const payment = (amountCents: number, reversedAt: Date | null = null) => ({
    type: "PAYMENT" as const,
    amountCents,
    reversedAt,
  });
  const refund = (amountCents: number, reversedAt: Date | null = null) => ({
    type: "REFUND" as const,
    amountCents,
    reversedAt,
  });

  it("tracks partial payments", () => {
    expect(summarizeBalance(10000, [payment(4000)]).balanceCents).toBe(6000);
    expect(summarizeBalance(10000, [payment(4000), payment(6000)]).balanceCents).toBe(0);
  });

  it("ignores reversed entries", () => {
    expect(summarizeBalance(10000, [payment(4000, new Date())]).balanceCents).toBe(10000);
  });

  it("treats a refund as lowering what is owed and what is kept equally", () => {
    const summary = summarizeBalance(50000, [payment(50000), refund(10000)]);
    expect(summary).toEqual({
      paidCents: 50000,
      refundedCents: 10000,
      netPaidCents: 40000,
      balanceCents: 0,
    });
  });

  it("reports no balance on a voided order", () => {
    expect(summarizeBalance(10000, [], true).balanceCents).toBe(0);
  });
});
