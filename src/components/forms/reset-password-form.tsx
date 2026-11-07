"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Field, FormError, useActionSubmit } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/validation";
import { resetPasswordAction } from "@/server/actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema, undefined, { raw: true }),
    defaultValues: { token, password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;
  const { submit, formError, pending } = useActionSubmit(form, resetPasswordAction, {
    success: "Password changed. Sign in with your new password.",
    onSuccess: () => router.replace("/login?reset=1"),
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" {...form.register("token")} />
      <Field
        id="password"
        label="New password"
        hint="At least 10 characters."
        error={errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          aria-invalid={Boolean(errors.password)}
          {...form.register("password")}
        />
      </Field>
      <Field
        id="confirmPassword"
        label="Confirm new password"
        error={errors.confirmPassword?.message}
      >
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirmPassword)}
          {...form.register("confirmPassword")}
        />
      </Field>
      <FormError message={errors.token?.message ?? formError} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
