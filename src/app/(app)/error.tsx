"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-20 text-center">
      <h1 className="text-xl font-semibold">This page could not load</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Nothing was changed. Try again, and if it keeps happening check that the database is
        running.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
