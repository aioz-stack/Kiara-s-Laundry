import type { OrderStatus, PaymentMethod, PricingUnit, Role } from "@/generated/prisma/enums";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  RECEIVED: "Received",
  WASHING: "Washing",
  DRYING: "Drying",
  FOLDING: "Folding",
  READY_FOR_PICKUP: "Ready for pickup",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  GCASH: "GCash",
  MAYA: "Maya",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  OTHER: "Other",
};

export const PRICING_UNIT_LABELS: Record<PricingUnit, string> = {
  PER_KG: "per kg",
  PER_LOAD: "per load",
  PER_PIECE: "per piece",
  FIXED: "fixed",
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  CASHIER: "Cashier",
  STAFF: "Staff",
};

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];
/** CANCELLED is reached only through the void flow, which requires a reason. */
export const SETTABLE_ORDER_STATUSES = ORDER_STATUSES.filter((status) => status !== "CANCELLED");
export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];
export const PRICING_UNITS = Object.keys(PRICING_UNIT_LABELS) as PricingUnit[];
export const ROLES = Object.keys(ROLE_LABELS) as Role[];

/** Plain-language definitions, shown wherever these figures appear. */
export const FINANCIAL_TERMS = {
  grossSales:
    "Totals of valid orders dated in this period, after discounts. Cancelled and voided orders are excluded.",
  netSales: "Gross sales minus refunds issued in this period on orders that are still valid.",
  collected:
    "Payments received in this period minus refunds paid out in this period, whichever day the order was made. Reversed entries are excluded.",
  outstanding: "What customers still owe: order totals minus payments applied.",
  outstandingPeriod: "Still unpaid today on orders dated in this period.",
  expenses: "Non-voided expenses dated in this period.",
  netCashFlow: "Collected minus expenses for this period. This is cash movement, not profit.",
  transactionCount: "Valid orders dated in this period.",
  averageTransaction: "Gross sales divided by the number of valid orders.",
} as const;
