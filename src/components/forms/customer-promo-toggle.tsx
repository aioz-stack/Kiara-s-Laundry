"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { PROMO_NAME } from "@/lib/promo";
import { setCustomerPromoAction } from "@/server/actions";

export function CustomerPromoToggle({
  customerId,
  customerName,
  enabled,
}: {
  customerId: string;
  customerName: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    startTransition(async () => {
      const result = await setCustomerPromoAction(customerId, { enabled: next });
      if (result.ok) {
        toast.success(`${PROMO_NAME} ${next ? "on" : "off"} for ${customerName}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Switch
      aria-label={`${PROMO_NAME} for ${customerName}`}
      checked={enabled}
      disabled={pending}
      onCheckedChange={change}
    />
  );
}
