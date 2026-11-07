/**
 * Money and quantity arithmetic. Safe to import from client and server.
 *
 * Money is integer centavos and quantities are integer thousandths, so nothing
 * here does floating-point arithmetic on amounts.
 *
 * Rounding rule: a line total is rounded half up to the nearest centavo. It is
 * the only place rounding occurs; every other total is an exact integer sum.
 */

export const MAX_UNIT_PRICE_CENTS = 10_000_000; // ₱100,000.00
export const MAX_QUANTITY_MILLI = 9_999_999; // 9,999.999
export const MAX_LINE_ITEMS = 50;
export const MAX_TRANSACTION_CENTS = 1_000_000_000; // ₱10,000,000.00
export const MAX_PAYMENT_CENTS = MAX_TRANSACTION_CENTS;
export const MAX_EXPENSE_CENTS = 1_000_000_000;

const MONEY_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;
const QUANTITY_PATTERN = /^\d{1,4}(\.\d{1,3})?$/;

function normalizeNumeric(input: string): string {
  return input.trim().replace(/,/g, "");
}

/** Parses "1,250.50" to 125050. Returns null for anything not a valid amount. */
export function parseMoneyToCents(input: string): number | null {
  const value = normalizeNumeric(input);
  if (!MONEY_PATTERN.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Parses "3.5" to 3500. Returns null for anything not a valid quantity. */
export function parseQuantityToMilli(input: string): number | null {
  const value = normalizeNumeric(input);
  if (!QUANTITY_PATTERN.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}

/** 125050 -> "1250.50": plain decimal for form fields and CSV. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}${Math.trunc(absolute / 100)}.${fraction}`;
}

/** 3500 -> "3.5" */
export function milliToDecimal(milli: number): string {
  const fraction = String(milli % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  const whole = Math.trunc(milli / 1000);
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** 125000 -> "₱1,250.00" */
export function formatMoney(cents: number, currency = "PHP"): string {
  const symbol =
    new Intl.NumberFormat("en-PH", { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency;
  const absolute = Math.abs(cents);
  const whole = new Intl.NumberFormat("en-PH").format(Math.trunc(absolute / 100));
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${symbol}${whole}.${fraction}`;
}

export function calculateLineTotal(quantityMilli: number, unitPriceCents: number): number {
  const scaled = quantityMilli * unitPriceCents + 500;
  return (scaled - (scaled % 1000)) / 1000;
}

export type LineInput = { quantityMilli: number; unitPriceCents: number };

export type TransactionTotals = {
  lineTotalsCents: number[];
  subtotalCents: number;
  discountCents: number;
  additionalChargeCents: number;
  totalCents: number;
};

export class InvalidTotalsError extends Error {}

/**
 * The one definition of how an order total is built. The discount applies to the
 * service subtotal only; additional charges are added after it. A promo free
 * load is a second discount, kept apart so reports can show what it cost.
 */
export function calculateTotals(
  lines: LineInput[],
  discountCents: number,
  additionalChargeCents: number,
  promoDiscountCents = 0,
): TransactionTotals {
  const lineTotalsCents = lines.map((line) =>
    calculateLineTotal(line.quantityMilli, line.unitPriceCents),
  );
  const subtotalCents = lineTotalsCents.reduce((sum, value) => sum + value, 0);
  if (discountCents + promoDiscountCents > subtotalCents) {
    throw new InvalidTotalsError("The discount cannot be more than the subtotal.");
  }
  const totalCents = subtotalCents - discountCents - promoDiscountCents + additionalChargeCents;
  if (totalCents > MAX_TRANSACTION_CENTS) {
    throw new InvalidTotalsError("The order total is above the allowed limit.");
  }
  return { lineTotalsCents, subtotalCents, discountCents, additionalChargeCents, totalCents };
}

export type PaymentLike = {
  type: "PAYMENT" | "REFUND";
  amountCents: number;
  reversedAt: Date | string | null;
};

export type BalanceSummary = {
  paidCents: number;
  refundedCents: number;
  netPaidCents: number;
  balanceCents: number;
};

/**
 * A refund returns money and lowers what the customer owes by the same amount,
 * so it leaves the balance unchanged: total 500, paid 500, refund 100 leaves 400
 * owed, 400 kept, 0 balance. The balance is therefore total minus payments.
 * Voided orders owe nothing.
 */
export function summarizeBalance(
  totalCents: number,
  payments: PaymentLike[],
  isVoided = false,
): BalanceSummary {
  let paidCents = 0;
  let refundedCents = 0;
  for (const payment of payments) {
    if (payment.reversedAt) continue;
    if (payment.type === "PAYMENT") paidCents += payment.amountCents;
    else refundedCents += payment.amountCents;
  }
  return {
    paidCents,
    refundedCents,
    netPaidCents: paidCents - refundedCents,
    balanceCents: isVoided ? 0 : totalCents - paidCents,
  };
}
