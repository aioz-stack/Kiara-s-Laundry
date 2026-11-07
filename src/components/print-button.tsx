"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    /** Added by the Android app, because its WebView ignores window.print. */
    KiaraNative?: { print(): void };
  }
}

function print() {
  if (window.KiaraNative) window.KiaraNative.print();
  else window.print();
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={print}>
      <Printer aria-hidden /> {label}
    </Button>
  );
}
