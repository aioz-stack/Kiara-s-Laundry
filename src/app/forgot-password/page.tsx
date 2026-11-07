import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { homePath } from "@/lib/permissions";
import { getActor } from "@/server/auth";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  const actor = await getActor();
  if (actor) redirect(homePath(actor.role));
  const { shopName } = await getSettings();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{shopName}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Enter your account email and we will send you a link to choose a new password.
        </p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
