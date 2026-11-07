import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/generated/prisma/enums";
import { ORDER_STATUS_LABELS } from "@/lib/labels";

const STATUS_VARIANTS: Record<
  OrderStatus,
  "default" | "muted" | "success" | "warning" | "destructive"
> = {
  RECEIVED: "muted",
  WASHING: "default",
  DRYING: "default",
  FOLDING: "default",
  READY_FOR_PICKUP: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

export function PaymentStateBadge({
  balanceCents,
  paidCents,
  voided,
}: {
  balanceCents: number;
  paidCents: number;
  voided: boolean;
}) {
  if (voided) return <Badge variant="muted">Voided</Badge>;
  if (balanceCents === 0) return <Badge variant="success">Paid</Badge>;
  if (paidCents > 0) return <Badge variant="warning">Partial</Badge>;
  return <Badge variant="destructive">Unpaid</Badge>;
}
