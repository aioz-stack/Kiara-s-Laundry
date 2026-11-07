import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const fieldStyles =
  "w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(fieldStyles, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldStyles, "min-h-20 py-2", className)}
      {...props}
    />
  );
}

/** A native select: keyboard, mobile, and form behaviour all work out of the box. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select data-slot="select" className={cn(fieldStyles, "h-9", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm leading-none font-medium", className)}
      {...props}
    />
  );
}
