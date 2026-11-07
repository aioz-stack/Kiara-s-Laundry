"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { Label } from "@/components/ui/input";
import type { ActionResult } from "@/server/action-result";

export function Field({
  id,
  label,
  error,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "flex flex-col gap-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Submits form values to a server action: shows the outcome, puts server field
 * errors back on the form, and refreshes the page data on success.
 */
export function useActionSubmit<Values extends FieldValues, Result>(
  form: UseFormReturn<Values>,
  action: (values: Values) => Promise<ActionResult<Result>>,
  options: { success: string; onSuccess?: (data: Result) => void },
) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    const result = await action(values);
    if (result.ok) {
      toast.success(options.success);
      options.onSuccess?.(result.data);
      router.refresh();
      return;
    }
    setFormError(result.error);
    for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
      form.setError(path.replace(/^values\./, "") as Path<Values>, { message });
    }
  });

  return { submit, formError, pending: form.formState.isSubmitting };
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
    >
      {message}
    </p>
  );
}
