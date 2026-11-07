"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PROMO_NAME } from "@/lib/promo";
import { setPromoEnabledAction } from "@/server/actions";

export function PromoToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    startTransition(async () => {
      const result = await setPromoEnabledAction({ enabled: next });
      if (result.ok) {
        toast.success(`${PROMO_NAME} is ${next ? "on" : "off"}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Switch
        id="promo-enabled"
        checked={enabled}
        disabled={pending}
        onCheckedChange={change}
        aria-describedby="promo-state"
      />
      <Label htmlFor="promo-enabled">{enabled ? "On" : "Off"}</Label>
      <span id="promo-state" className="sr-only">
        {enabled ? "Customers can earn and use free loads." : "The promo is hidden from customers."}
      </span>
    </div>
  );
}
