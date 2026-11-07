"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, FormError, useActionSubmit } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { reasonSchema } from "@/lib/validation";
import type { ActionResult } from "@/server/action-result";

type ReasonValues = z.input<typeof reasonSchema>;

/** Confirmation for a destructive financial action. A reason is required. */
export function ReasonDialog({
  trigger,
  title,
  description,
  confirmLabel,
  success,
  action,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  success: string;
  action: (values: ReasonValues) => Promise<ActionResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<ReasonValues>({
    resolver: zodResolver(reasonSchema, undefined, { raw: true }),
    defaultValues: { reason: "" },
  });
  const { submit, formError, pending } = useActionSubmit(form, action, {
    success,
    onSuccess: () => {
      setOpen(false);
      form.reset();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <Field id="reason" label="Reason" error={form.formState.errors.reason?.message}>
            <Textarea
              id="reason"
              aria-invalid={!!form.formState.errors.reason}
              {...form.register("reason")}
            />
          </Field>
          <FormError message={formError} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Saving…" : confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
