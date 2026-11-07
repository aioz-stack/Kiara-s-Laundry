"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field, FormError, useActionSubmit } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { paymentSchema, refundSchema, type PaymentFormValues } from "@/lib/validation";
import { recordPaymentAction, recordRefundAction } from "@/server/actions";

function MoneyDialog({
  mode,
  transactionId,
  limitCents,
  amountDefault,
  nowLocal,
  currency,
}: {
  mode: "payment" | "refund";
  transactionId: string;
  limitCents: number;
  amountDefault: string;
  nowLocal: string;
  currency: string;
}) {
  const isRefund = mode === "refund";
  const [open, setOpen] = useState(false);
  const defaults: PaymentFormValues = {
    amount: amountDefault,
    method: "CASH",
    paidAt: nowLocal,
    referenceNumber: "",
    notes: "",
  };
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(isRefund ? refundSchema : paymentSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const { submit, formError, pending } = useActionSubmit(
    form,
    (values) =>
      isRefund
        ? recordRefundAction(transactionId, values)
        : recordPaymentAction(transactionId, values),
    {
      success: isRefund ? "Refund recorded" : "Payment recorded",
      onSuccess: () => setOpen(false),
    },
  );

  function handleOpenChange(next: boolean) {
    if (next) form.reset(defaults);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={isRefund ? "outline" : "default"}>
          {isRefund ? "Refund" : "Record payment"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{isRefund ? "Refund money to the customer" : "Record a payment"}</DialogTitle>
        <DialogDescription>
          {isRefund
            ? `Up to ${formatMoney(limitCents, currency)} kept on this order can be refunded. The refund is dated when the money left and lowers what the customer owes by the same amount.`
            : `Balance: ${formatMoney(limitCents, currency)}. A smaller amount leaves the rest unpaid.`}
        </DialogDescription>
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
          <Field id="amount" label="Amount" error={errors.amount?.message}>
            <Input
              id="amount"
              inputMode="decimal"
              className="tabular"
              aria-invalid={!!errors.amount}
              {...form.register("amount")}
            />
          </Field>
          <Field id="method" label="Method" error={errors.method?.message}>
            <NativeSelect id="method" {...form.register("method")}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="paidAt" label="Date" error={errors.paidAt?.message}>
            <Input id="paidAt" type="datetime-local" {...form.register("paidAt")} />
          </Field>
          <Field id="referenceNumber" label="Reference no." error={errors.referenceNumber?.message}>
            <Input id="referenceNumber" {...form.register("referenceNumber")} />
          </Field>
          <Field
            id="notes"
            label={isRefund ? "Reason" : "Notes"}
            error={errors.notes?.message}
            className="flex flex-col gap-1.5 sm:col-span-2"
          >
            <Textarea id="notes" aria-invalid={!!errors.notes} {...form.register("notes")} />
          </Field>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <FormError message={formError} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : isRefund ? "Record refund" : "Save payment"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentDialog(props: {
  transactionId: string;
  balanceCents: number;
  amountDefault: string;
  nowLocal: string;
  currency: string;
}) {
  return <MoneyDialog mode="payment" limitCents={props.balanceCents} {...props} />;
}

export function RefundDialog(props: {
  transactionId: string;
  netPaidCents: number;
  nowLocal: string;
  currency: string;
}) {
  return <MoneyDialog mode="refund" limitCents={props.netPaidCents} amountDefault="" {...props} />;
}
