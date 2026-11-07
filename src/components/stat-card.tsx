import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/tooltip";

export function StatCard({
  label,
  value,
  term,
  note,
}: {
  label: string;
  value: string;
  term?: string;
  note?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        {term ? <InfoTip label={label} text={term} /> : null}
      </div>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </Card>
  );
}
