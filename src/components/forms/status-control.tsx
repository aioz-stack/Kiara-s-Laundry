"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/input";
import type { OrderStatus } from "@/generated/prisma/enums";
import { ORDER_STATUS_LABELS, SETTABLE_ORDER_STATUSES } from "@/lib/labels";
import { updateStatusAction } from "@/server/actions";

export function StatusControl({
  transactionId,
  status,
  canComplete,
}: {
  transactionId: string;
  status: OrderStatus;
  canComplete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const locked = status === "COMPLETED" && !canComplete;
  const options = SETTABLE_ORDER_STATUSES.filter(
    (option) => canComplete || option !== "COMPLETED" || status === "COMPLETED",
  );

  function change(next: OrderStatus) {
    startTransition(async () => {
      const result = await updateStatusAction(transactionId, { status: next });
      if (result.ok) {
        toast.success(`Status: ${ORDER_STATUS_LABELS[next]}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <NativeSelect
      aria-label="Order status"
      className="w-44"
      value={status}
      disabled={pending || locked}
      onChange={(event) => change(event.target.value as OrderStatus)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {ORDER_STATUS_LABELS[option]}
        </option>
      ))}
    </NativeSelect>
  );
}
