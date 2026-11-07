"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Field, FormError, useActionSubmit } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { settingsSchema, type SettingsInput } from "@/lib/validation";
import { saveSettingsAction } from "@/server/actions";

export function SettingsForm({ defaults }: { defaults: SettingsInput }) {
  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const { submit, formError, pending } = useActionSubmit(form, saveSettingsAction, {
    success: "Settings saved",
  });
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field id="shopName" label="Shop name" error={errors.shopName?.message}>
        <Input id="shopName" {...form.register("shopName")} />
      </Field>
      <Field id="contactNumber" label="Contact number" error={errors.contactNumber?.message}>
        <Input id="contactNumber" {...form.register("contactNumber")} />
      </Field>
      <Field
        id="address"
        label="Address"
        error={errors.address?.message}
        className="flex flex-col gap-1.5 sm:col-span-2"
      >
        <Input id="address" {...form.register("address")} />
      </Field>
      <Field
        id="receiptFooter"
        label="Receipt footer"
        error={errors.receiptFooter?.message}
        className="flex flex-col gap-1.5 sm:col-span-2"
      >
        <Textarea id="receiptFooter" {...form.register("receiptFooter")} />
      </Field>
      <Field
        id="receiptPrefix"
        label="Receipt prefix"
        hint="Used on new receipt numbers only."
        error={errors.receiptPrefix?.message}
      >
        <Input id="receiptPrefix" {...form.register("receiptPrefix")} />
      </Field>
      <Field
        id="currency"
        label="Currency"
        hint="Changes the symbol shown. Amounts are not converted."
        error={errors.currency?.message}
      >
        <Input id="currency" {...form.register("currency")} />
      </Field>
      <Field
        id="timeZone"
        label="Time zone"
        hint="Defines where each business day starts and ends."
        error={errors.timeZone?.message}
      >
        <Input id="timeZone" {...form.register("timeZone")} />
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormError message={formError} />
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </form>
  );
}
