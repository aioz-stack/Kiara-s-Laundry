"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field, FormError, useActionSubmit } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/validation";
import { requestPasswordResetAction } from "@/server/actions";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema, undefined, { raw: true }),
    defaultValues: { email: "" },
  });
  const { errors } = form.formState;
  const { submit, formError, pending } = useActionSubmit(form, requestPasswordResetAction, {
    success: "Check your email",
    onSuccess: () => setSentTo(form.getValues("email").trim()),
  });

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-sm">
          If <span className="font-medium break-all">{sentTo}</span> belongs to an active account, a
          reset link is on its way. It works for 60 minutes. Check the spam folder too.
        </p>
        <Button type="button" variant="outline" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
        <BackToSignIn />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          aria-invalid={Boolean(errors.email)}
          {...form.register("email")}
        />
      </Field>
      <FormError message={formError} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <BackToSignIn />
    </form>
  );
}

function BackToSignIn() {
  return (
    <Link
      href="/login"
      className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      Back to sign in
    </Link>
  );
}
