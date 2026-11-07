import { Badge } from "@/components/ui/badge";
import { PAID_LOADS_PER_FREE_LOAD, type PromoSummary } from "@/lib/promo";
import { cn } from "@/lib/utils";

/** A customer with no standing has the promo switched off for them. */
export function CustomerPromoState({ promo }: { promo: PromoSummary | undefined }) {
  return promo ? <PromoProgress promo={promo} /> : <Badge variant="muted">Off</Badge>;
}

export function PromoProgress({ promo, className }: { promo: PromoSummary; className?: string }) {
  return (
    <span className={cn("tabular inline-flex items-center gap-2 whitespace-nowrap", className)}>
      {promo.progress}/{PAID_LOADS_PER_FREE_LOAD}
      {promo.freeLoadsAvailable > 0 ? (
        <Badge variant="success">{promo.freeLoadsAvailable} free</Badge>
      ) : null}
    </span>
  );
}
