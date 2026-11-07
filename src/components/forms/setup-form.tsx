"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Field, FormError, useActionSubmit } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firstOwnerSchema, type FirstOwnerValues } from "@/lib/validation";
import { createFirstOwnerAction } from "@/server/actions";

export function SetupForm() {
  const router = useRouter();
  const form = useForm<FirstOwnerValues>({
    resolver: zodResolver(firstOwnerSchema, undefined, { raw: true }),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  async function signInOwner() {
    const { email, password } = form.getValues();
    await signIn("credentials", { email, password, redirect: false });
    router.replace("/");
  }

  const { submit, formError, pending } = useActionSubmit(form, createFirstOwnerAction, {
    success: "Owner account created",
    onSuccess: () => void signInOwner(),
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field id="name" label="Your name" error={errors.name?.message}>
        <Input id="name" autoFocus {...form.register("name")} />
      </Field>
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="username" {...form.register("email")} />
      </Field>
      <Field
        id="password"
        label="Password"
        hint="At least 10 characters."
        error={errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...form.register("password")}
        />
      </Field>
      <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword?.message}>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...form.register("confirmPassword")}
        />
      </Field>
      <FormError message={formError} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create owner account"}
      </Button>
    </form>
  );
}
