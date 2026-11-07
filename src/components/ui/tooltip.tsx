"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import { Info } from "lucide-react";

/** A small info icon explaining a term. Keyboard focusable. */
export function InfoTip({ text, label }: { text: string; label: string }) {
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger
          aria-label={`About ${label}: ${text}`}
          className="no-print rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Info className="size-3.5" aria-hidden />
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 max-w-64 rounded-md bg-foreground px-3 py-2 text-xs leading-relaxed text-background shadow-md"
          >
            {text}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
