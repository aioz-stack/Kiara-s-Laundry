"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Field, FormError, useActionSubmit } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { PRICING_UNIT_LABELS, PRICING_UNITS, ROLE_LABELS, ROLES } from "@/lib/labels";
import { PROMO_NAME } from "@/lib/promo";
import {
  categorySchema,
  customerSchema,
  serviceSchema,
  userCreateSchema,
  userUpdateSchema,
  type CategoryInput,
  type CustomerFormValues,
  type ServiceFormValues,
  type UserCreateValues,
  type UserUpdateValues,
} from "@/lib/validation";
import {
  createUserAction,
  saveCategoryAction,
  saveCustomerAction,
  saveServiceAction,
  updateUserAction,
} from "@/server/actions";

function DialogActions({
  pending,
  onCancel,
  formError,
}: {
  pending: boolean;
  onCancel: () => void;
  formError: string | null;
}) {
  return (
    <>
      <FormError message={formError} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );
}

export function ServiceDialog({
  id = null,
  defaults,
  trigger,
}: {
  id?: string | null;
  defaults: ServiceFormValues;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const { submit, formError, pending } = useActionSubmit(
    form,
    (values) => saveServiceAction(id, values),
    { success: "Service saved", onSuccess: () => setOpen(false) },
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(defaults);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{id ? "Edit service" : "Add a service"}</DialogTitle>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
          <Field id="service-name" label="Name" error={errors.name?.message}>
            <Input id="service-name" {...form.register("name")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="service-unit" label="Priced" error={errors.pricingUnit?.message}>
              <NativeSelect id="service-unit" {...form.register("pricingUnit")}>
                {PRICING_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {PRICING_UNIT_LABELS[unit]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="service-price"
              label="Current price"
              hint="Past orders keep the price they were charged."
              error={errors.currentPrice?.message}
            >
              <Input
                id="service-price"
                inputMode="decimal"
                className="tabular"
                {...form.register("currentPrice")}
              />
            </Field>
          </div>
          <Field id="service-description" label="Description" error={errors.description?.message}>
            <Textarea id="service-description" {...form.register("description")} />
          </Field>
          <div className="flex items-center gap-2">
            <input
              id="service-active"
              type="checkbox"
              className="size-4 accent-primary"
              {...form.register("isActive")}
            />
            <Label htmlFor="service-active">Offered on new orders</Label>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                id="service-promo"
                type="checkbox"
                className="size-4 accent-primary"
                {...form.register("promoEligible")}
              />
              <Label htmlFor="service-promo">Counts for the {PROMO_NAME}</Label>
            </div>
            {errors.promoEligible?.message ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.promoEligible.message}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Each load earns 1 stamp. Must be priced per load.
              </p>
            )}
          </div>
          <DialogActions pending={pending} formError={formError} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerDialog({
  id = null,
  defaults,
  trigger,
}: {
  id?: string | null;
  defaults: CustomerFormValues;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const { submit, formError, pending } = useActionSubmit(
    form,
    (values) => saveCustomerAction(id, values),
    { success: "Customer saved", onSuccess: () => setOpen(false) },
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(defaults);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{id ? "Edit customer" : "Add a customer"}</DialogTitle>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
          <Field id="customer-name" label="Name" error={errors.name?.message}>
            <Input id="customer-name" {...form.register("name")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="customer-phone" label="Phone" error={errors.phone?.message}>
              <Input id="customer-phone" type="tel" {...form.register("phone")} />
            </Field>
            <Field id="customer-email" label="Email" error={errors.email?.message}>
              <Input id="customer-email" type="email" {...form.register("email")} />
            </Field>
          </div>
          <Field id="customer-notes" label="Notes" error={errors.notes?.message}>
            <Textarea id="customer-notes" {...form.register("notes")} />
          </Field>
          <DialogActions pending={pending} formError={formError} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryDialog({
  id = null,
  defaults,
  trigger,
}: {
  id?: string | null;
  defaults: CategoryInput;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const { submit, formError, pending } = useActionSubmit(
    form,
    (values) => saveCategoryAction(id, values),
    { success: "Category saved", onSuccess: () => setOpen(false) },
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(defaults);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{id ? "Edit category" : "Add a category"}</DialogTitle>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
          <Field id="category-name" label="Name" error={form.formState.errors.name?.message}>
            <Input id="category-name" {...form.register("name")} />
          </Field>
          <div className="flex items-center gap-2">
            <input
              id="category-active"
              type="checkbox"
              className="size-4 accent-primary"
              {...form.register("isActive")}
            />
            <Label htmlFor="category-active">Available for new expenses</Label>
          </div>
          <DialogActions pending={pending} formError={formError} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewUserDialog({ trigger }: { trigger: ReactNode }) {
  const defaults: UserCreateValues = { name: "", email: "", role: "CASHIER", password: "" };
  const [open, setOpen] = useState(false);
  const form = useForm<UserCreateValues>({
    resolver: zodResolver(userCreateSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const { submit, formError, pending } = useActionSubmit(form, createUserAction, {
    success: "User created",
    onSuccess: () => setOpen(false),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(defaults);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Add a user</DialogTitle>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate autoComplete="off">
          <Field id="user-name" label="Name" error={errors.name?.message}>
            <Input id="user-name" {...form.register("name")} />
          </Field>
          <Field id="user-email" label="Email" error={errors.email?.message}>
            <Input id="user-email" type="email" {...form.register("email")} />
          </Field>
          <Field id="user-role" label="Role" error={errors.role?.message}>
            <NativeSelect id="user-role" {...form.register("role")}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="user-password"
            label="Temporary password"
            hint="At least 10 characters."
            error={errors.password?.message}
          >
            <Input
              id="user-password"
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
          </Field>
          <DialogActions pending={pending} formError={formError} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditUserDialog({
  id,
  defaults,
  trigger,
}: {
  id: string;
  defaults: UserUpdateValues;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<UserUpdateValues>({
    resolver: zodResolver(userUpdateSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const { submit, formError, pending } = useActionSubmit(
    form,
    (values) => updateUserAction(id, values),
    { success: "User updated", onSuccess: () => setOpen(false) },
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(defaults);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Edit user</DialogTitle>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate autoComplete="off">
          <Field id="edit-user-name" label="Name" error={errors.name?.message}>
            <Input id="edit-user-name" {...form.register("name")} />
          </Field>
          <Field id="edit-user-role" label="Role" error={errors.role?.message}>
            <NativeSelect id="edit-user-role" {...form.register("role")}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="edit-user-password"
            label="New password (optional)"
            hint="Leave blank to keep the current password."
            error={errors.password?.message}
          >
            <Input
              id="edit-user-password"
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
          </Field>
          <div className="flex items-center gap-2">
            <input
              id="edit-user-active"
              type="checkbox"
              className="size-4 accent-primary"
              {...form.register("isActive")}
            />
            <Label htmlFor="edit-user-active">Account is active</Label>
          </div>
          <DialogActions pending={pending} formError={formError} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
