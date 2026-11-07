import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/login-form";
import { homePath } from "@/lib/permissions";
import { getActor } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { isFirstRunSetupOpen } from "@/server/users";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const actor = await getActor();
  if (actor) redirect(homePath(actor.role));
  if (await isFirstRunSetupOpen()) redirect("/setup");
  const { shopName } = await getSettings();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{shopName}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">Sign in to continue.</p>
        <LoginForm />
      </div>
    </main>
  );
}
