"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Field, FormError, useActionSubmit } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import type { PricingUnit } from "@/generated/prisma/enums";
import { PRICING_UNIT_LABELS } from "@/lib/labels";
import {
  calculateLineTotal,
  centsToDecimal,
  formatMoney,
  parseMoneyToCents,
  parseQuantityToMilli,
} from "@/lib/money";
import {
  freeLoadFits,
  freeLoadPriceCents,
  PAID_LOADS_PER_FREE_LOAD,
  PROMO_NAME,
  type PromoSummary,
} from "@/lib/promo";
import { transactionSchema, type TransactionFormValues } from "@/lib/validation";
import { createTransactionAction, updateTransactionAction } from "@/server/actions";

export type ServiceOption = {
  id: string;
  name: string;
  pricingUnit: PricingUnit;
  currentPriceCents: number;
  promoEligible: boolean;
  isActive: boolean;
};

export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** Null while the promo is off. */
  promo: PromoSummary | null;
};

const QUANTITY_LABEL: Record<PricingUnit, string> = {
  PER_KG: "kg",
  PER_LOAD: "loads",
  PER_PIECE: "pcs",
  FIXED: "qty",
};

/** The preview is for the cashier. The server recalculates everything on save. */
function usePreview(
  form: ReturnType<typeof useForm<TransactionFormValues>>,
  services: ServiceOption[],
  autoFreeLoad: boolean,
) {
  const items = useWatch({ control: form.control, name: "items" });
  const discount = useWatch({ control: form.control, name: "discount" });
  const additional = useWatch({ control: form.control, name: "additionalCharge" });
  const redeemFreeLoad = useWatch({ control: form.control, name: "redeemFreeLoad" });
  const parsed = items.map((item) => ({
    promoEligible: services.find((service) => service.id === item.serviceId)?.promoEligible,
    quantityMilli: parseQuantityToMilli(item.quantity) ?? 0,
    unitPriceCents: parseMoneyToCents(item.unitPrice) ?? 0,
  }));
  const lines = parsed.map((line) => calculateLineTotal(line.quantityMilli, line.unitPriceCents));
  const subtotal = lines.reduce((sum, value) => sum + value, 0);
  const discountCents = parseMoneyToCents(discount) ?? 0;
  const additionalCents = parseMoneyToCents(additional) ?? 0;
  const freeLoadCents = freeLoadPriceCents(parsed);
  const useFreeLoad = redeemFreeLoad ?? (autoFreeLoad && freeLoadFits(parsed, discountCents));
  const promoCents = useFreeLoad ? (freeLoadCents ?? 0) : 0;
  return {
    serviceIds: items.map((item) => item.serviceId),
    lines,
    subtotal,
    discountCents,
    additionalCents,
    useFreeLoad,
    cashierChose: redeemFreeLoad !== undefined,
    hasLoad: freeLoadCents !== null,
    promoCents,
    total: subtotal - discountCents - promoCents + additionalCents,
  };
}

export function TransactionForm({
  transactionId,
  services,
  customers,
  defaults,
  currency,
  freeLoadHolderId = null,
}: {
  transactionId?: string;
  services: ServiceOption[];
  customers: CustomerOption[];
  defaults: TransactionFormValues;
  currency: string;
  /** The customer whose free load this saved order already holds. */
  freeLoadHolderId?: string | null;
}) {
  const router = useRouter();
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const { errors } = form.formState;
  const customerId = useWatch({ control: form.control, name: "customerId" });
  const customerPromo = customers.find((customer) => customer.id === customerId)?.promo ?? null;
  const holdsFreeLoad = !!customerId && customerId === freeLoadHolderId;
  const canUseFreeLoad = holdsFreeLoad || (customerPromo?.freeLoadsAvailable ?? 0) > 0;
  const preview = usePreview(form, services, !transactionId && canUseFreeLoad);

  const { submit, formError, pending } = useActionSubmit(
    form,
    (values) =>
      transactionId
        ? updateTransactionAction(transactionId, values)
        : createTransactionAction(values),
    {
      success: transactionId ? "Order updated" : "Order created",
      onSuccess: (data) => router.push(`/transactions/${data.id}`),
    },
  );

  function pickCustomer(name: string) {
    const match = customers.find(
      (customer) => customer.name.toLowerCase() === name.trim().toLowerCase(),
    );
    form.setValue("customerId", match?.id ?? "");
    form.setValue("redeemFreeLoad", transactionId ? false : undefined);
    if (match) {
      form.setValue("customerPhone", match.phone ?? "");
      form.setValue("customerEmail", match.email ?? "");
    }
  }

  function pickService(index: number, serviceId: string) {
    const service = services.find((option) => option.id === serviceId);
    if (service) {
      form.setValue(`items.${index}.unitPrice`, centsToDecimal(service.currentPriceCents));
    }
  }

  const firstActive = services.find((service) => service.isActive);

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_20rem]" noValidate>
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <input type="hidden" {...form.register("customerId")} />
            <Field
              id="customerName"
              label="Name"
              hint="Leave blank for a walk-in."
              error={errors.customerName?.message}
            >
              <Input
                id="customerName"
                list="customer-options"
                autoComplete="off"
                {...form.register("customerName", {
                  onChange: (event) => pickCustomer(event.target.value),
                })}
              />
              <datalist id="customer-options">
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.name}>
                    {customer.phone}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field id="customerPhone" label="Phone" error={errors.customerPhone?.message}>
              <Input id="customerPhone" type="tel" {...form.register("customerPhone")} />
            </Field>
            <Field id="customerEmail" label="Email" error={errors.customerEmail?.message}>
              <Input id="customerEmail" type="email" {...form.register("customerEmail")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {fields.map((field, index) => {
              const itemErrors = errors.items?.[index];
              const serviceId = preview.serviceIds[index];
              const unit = services.find((service) => service.id === serviceId)?.pricingUnit;
              return (
                <div
                  key={field.id}
                  className="grid items-start gap-3 rounded-md border p-3 sm:grid-cols-[1fr_6rem_7rem_6.5rem_2.25rem] sm:border-0 sm:p-0"
                >
                  <Field
                    id={`item-${index}-service`}
                    label="Service"
                    error={itemErrors?.serviceId?.message}
                  >
                    <NativeSelect
                      id={`item-${index}-service`}
                      {...form.register(`items.${index}.serviceId`, {
                        onChange: (event) => pickService(index, event.target.value),
                      })}
                    >
                      <option value="">Choose…</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} ({formatMoney(service.currentPriceCents, currency)}{" "}
                          {PRICING_UNIT_LABELS[service.pricingUnit]})
                          {service.isActive ? "" : " - archived"}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field
                    id={`item-${index}-quantity`}
                    label={`Qty${unit ? ` (${QUANTITY_LABEL[unit]})` : ""}`}
                    error={itemErrors?.quantity?.message}
                  >
                    <Input
                      id={`item-${index}-quantity`}
                      inputMode="decimal"
                      className="tabular"
                      {...form.register(`items.${index}.quantity`)}
                    />
                  </Field>
                  <Field
                    id={`item-${index}-price`}
                    label="Unit price"
                    error={itemErrors?.unitPrice?.message}
                  >
                    <Input
                      id={`item-${index}-price`}
                      inputMode="decimal"
                      className="tabular"
                      {...form.register(`items.${index}.unitPrice`)}
                    />
                  </Field>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm leading-none font-medium">Line total</span>
                    <span className="tabular flex h-9 items-center text-sm">
                      {formatMoney(preview.lines[index] ?? 0, currency)}
                    </span>
                  </div>
                  <div className="flex items-end sm:h-[3.75rem]">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove item ${index + 1}`}
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
              );
            })}
            {typeof errors.items?.message === "string" ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.items.message}
              </p>
            ) : null}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    serviceId: firstActive?.id ?? "",
                    quantity: "1",
                    unitPrice: firstActive ? centsToDecimal(firstActive.currentPriceCents) : "0",
                  })
                }
              >
                <Plus aria-hidden /> Add service
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="orderDate" label="Order date" error={errors.orderDate?.message}>
              <Input id="orderDate" type="datetime-local" {...form.register("orderDate")} />
            </Field>
            <Field id="dueDate" label="Due date (optional)" error={errors.dueDate?.message}>
              <Input id="dueDate" type="datetime-local" {...form.register("dueDate")} />
            </Field>
            <Field
              id="notes"
              label="Notes"
              error={errors.notes?.message}
              className="flex flex-col gap-1.5 sm:col-span-2"
            >
              <Textarea id="notes" {...form.register("notes")} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit lg:sticky lg:top-8">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="tabular flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatMoney(preview.subtotal, currency)}</dd>
            </div>
          </dl>
          {customerPromo || canUseFreeLoad ? (
            <div className="flex flex-col gap-2 rounded-md bg-accent p-3 text-sm text-accent-foreground">
              <p className="font-medium">{PROMO_NAME}</p>
              {customerPromo ? (
                <p className="text-xs">
                  {customerPromo.progress} of {PAID_LOADS_PER_FREE_LOAD} stamps toward the next free
                  load
                </p>
              ) : null}
              {canUseFreeLoad ? (
                <div className="flex items-center gap-2">
                  <input
                    id="redeemFreeLoad"
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={preview.useFreeLoad}
                    onChange={(event) => form.setValue("redeemFreeLoad", event.target.checked)}
                  />
                  <Label htmlFor="redeemFreeLoad">
                    Use free load
                    {customerPromo ? ` (${customerPromo.freeLoadsAvailable} available)` : ""}
                  </Label>
                </div>
              ) : null}
              {!transactionId && canUseFreeLoad && !preview.cashierChose ? (
                <p className="text-xs">
                  {preview.useFreeLoad
                    ? "Applied automatically. Untick to save it for later."
                    : "Not applied to this order. The customer keeps it for a later load."}
                </p>
              ) : null}
              {preview.useFreeLoad && !preview.hasLoad ? (
                <p role="alert" className="text-xs text-destructive">
                  Add a load of a promo service to use the free load.
                </p>
              ) : null}
            </div>
          ) : null}
          <Field id="discount" label="Discount" error={errors.discount?.message}>
            <Input
              id="discount"
              inputMode="decimal"
              className="tabular"
              {...form.register("discount")}
            />
          </Field>
          <Field
            id="additionalCharge"
            label="Additional charges"
            hint="Added after the discount."
            error={errors.additionalCharge?.message}
          >
            <Input
              id="additionalCharge"
              inputMode="decimal"
              className="tabular"
              {...form.register("additionalCharge")}
            />
          </Field>
          {preview.promoCents > 0 ? (
            <div className="tabular flex justify-between text-sm">
              <span className="text-muted-foreground">Free load</span>
              <span>-{formatMoney(preview.promoCents, currency)}</span>
            </div>
          ) : null}
          <div className="tabular flex items-baseline justify-between border-t pt-3">
            <span className="text-sm font-medium">Total</span>
            <span className="text-xl font-semibold">{formatMoney(preview.total, currency)}</span>
          </div>
          <FormError message={formError} />
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : transactionId ? "Save changes" : "Create order"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
