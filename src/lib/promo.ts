/**
 * The 10+1 Laundry Promo. Safe to import from client and server.
 *
 * Everything is derived from orders rather than kept as a running counter, so a
 * reversed payment, a refund, or a void corrects the customer's count by itself.
 *
 * - One stamp is one whole load of a service marked for the promo, the Regular and
 *   VIP per-load services. The mark is copied onto each order line when it is sold.
 * - An order counts once it is COMPLETED and paid in full with nothing refunded.
 * - Only orders created while the promo was on count.
 * - The free load on an order earns no stamp.
 * - A new order uses an earned free load by itself, unless the cashier saves it.
 */
import type { OrderStatus } from "@/generated/prisma/enums";
import { calculateLineTotal, summarizeBalance, type PaymentLike } from "@/lib/money";

export const PROMO_NAME = "10+1 Laundry Promo";
export const PAID_LOADS_PER_FREE_LOAD = 10;

const ONE_LOAD_MILLI = 1000;

export type PromoOrder = {
  status: OrderStatus;
  totalCents: number;
  voidedAt: Date | null;
  promoEarning: boolean;
  promoFreeLoad: boolean;
  items: { promoEligibleSnapshot: boolean; quantityMilli: number }[];
  payments: PaymentLike[];
};

export type PromoSummary = {
  paidLoads: number;
  freeLoadsEarned: number;
  freeLoadsUsed: number;
  freeLoadsAvailable: number;
  /** Paid loads toward the next free load, 0 to 9. */
  progress: number;
};

export function paidLoadsOnOrder(order: PromoOrder): number {
  if (!order.promoEarning || order.voidedAt || order.status !== "COMPLETED") return 0;
  const { netPaidCents } = summarizeBalance(order.totalCents, order.payments);
  if (order.totalCents === 0 || netPaidCents < order.totalCents) return 0;
  const loadMilli = order.items
    .filter((item) => item.promoEligibleSnapshot)
    .reduce((sum, item) => sum + item.quantityMilli, 0);
  const wholeLoads = Math.floor(loadMilli / ONE_LOAD_MILLI);
  return Math.max(wholeLoads - (order.promoFreeLoad ? 1 : 0), 0);
}

/** Available never goes below zero, even if a counted order is later reversed. */
export function summarizePromo(orders: PromoOrder[]): PromoSummary {
  const valid = orders.filter((order) => !order.voidedAt);
  const paidLoads = valid.reduce((sum, order) => sum + paidLoadsOnOrder(order), 0);
  const freeLoadsEarned = Math.floor(paidLoads / PAID_LOADS_PER_FREE_LOAD);
  const freeLoadsUsed = valid.filter((order) => order.promoFreeLoad).length;
  return {
    paidLoads,
    freeLoadsEarned,
    freeLoadsUsed,
    freeLoadsAvailable: Math.max(freeLoadsEarned - freeLoadsUsed, 0),
    progress: paidLoads % PAID_LOADS_PER_FREE_LOAD,
  };
}

export type PromoLine = {
  promoEligible: boolean | undefined;
  quantityMilli: number;
  unitPriceCents: number;
};

/**
 * What one free load takes off an order: the price of its cheapest load, so the
 * reward is the same whichever line the cashier enters first. Null when the
 * order has no whole load to give away.
 */
export function freeLoadPriceCents(lines: PromoLine[]): number | null {
  const prices = lines
    .filter((line) => line.promoEligible && line.quantityMilli >= ONE_LOAD_MILLI)
    .map((line) => line.unitPriceCents);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * Whether a free load can go on an order without help. It must never stop a sale,
 * so an order with no load to give away, or a discount that leaves no room for
 * it, goes through at its normal total and the customer keeps the free load.
 */
export function freeLoadFits(lines: PromoLine[], discountCents: number): boolean {
  const priceCents = freeLoadPriceCents(lines);
  if (priceCents === null) return false;
  const subtotalCents = lines.reduce(
    (sum, line) => sum + calculateLineTotal(line.quantityMilli, line.unitPriceCents),
    0,
  );
  return discountCents + priceCents <= subtotalCents;
}
