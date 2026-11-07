"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Field, FormError, useActionSubmit } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/labels";
import { expenseSchema, type ExpenseFormValues } from "@/lib/validation";
import { saveExpenseAction } from "@/server/actions";

export function ExpenseDialog({
  expenseId = null,
  categories,
  defaults,
  trigger,
}: {
  expenseId?: string | null;
  categories: { id: string; name: string; isActive: boolean }[];
  defaults: ExpenseFormValues;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const { submit, formError, pending } = useActionSubmit(
    form,
    (values) => saveExpenseAction(expenseId, values),
    {
      success: expenseId ? "Expense updated" : "Expense recorded",
      onSuccess: () => setOpen(false),
    },
  );

  function handleOpenChange(next: boolean) {
    if (next) form.reset(defaults);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{expenseId ? "Edit expense" : "Record an expense"}</DialogTitle>
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
          <Field
            id="description"
            label="Description"
            error={errors.description?.message}
            className="flex flex-col gap-1.5 sm:col-span-2"
          >
            <Input id="description" {...form.register("description")} />
          </Field>
          <Field id="categoryId" label="Category" error={errors.categoryId?.message}>
            <NativeSelect id="categoryId" {...form.register("categoryId")}>
              <option value="">Choose…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.isActive ? "" : " (archived)"}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="expense-amount" label="Amount" error={errors.amount?.message}>
            <Input
              id="expense-amount"
              inputMode="decimal"
              className="tabular"
              {...form.register("amount")}
            />
          </Field>
          <Field id="expenseDate" label="Expense date" error={errors.expenseDate?.message}>
            <Input id="expenseDate" type="date" {...form.register("expenseDate")} />
          </Field>
          <Field id="paymentMethod" label="Paid by" error={errors.paymentMethod?.message}>
            <NativeSelect id="paymentMethod" {...form.register("paymentMethod")}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="payee" label="Payee (optional)" error={errors.payee?.message}>
            <Input id="payee" {...form.register("payee")} />
          </Field>
          <Field
            id="expense-reference"
            label="Receipt / reference no."
            error={errors.referenceNumber?.message}
          >
            <Input id="expense-reference" {...form.register("referenceNumber")} />
          </Field>
          <Field
            id="attachmentUrl"
            label="Attachment link (optional)"
            error={errors.attachmentUrl?.message}
            className="flex flex-col gap-1.5 sm:col-span-2"
          >
            <Input id="attachmentUrl" type="url" {...form.register("attachmentUrl")} />
          </Field>
          <Field
            id="expense-notes"
            label="Notes"
            error={errors.notes?.message}
            className="flex flex-col gap-1.5 sm:col-span-2"
          >
            <Textarea id="expense-notes" {...form.register("notes")} />
          </Field>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <FormError message={formError} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save expense"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
