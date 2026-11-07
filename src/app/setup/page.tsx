import { redirect } from "next/navigation";
import { SetupForm } from "@/components/forms/setup-form";
import { getSettings } from "@/server/settings";
import { isFirstRunSetupOpen } from "@/server/users";

export const metadata = { title: "Set up" };

// Depends on the database, so it must not be fixed at build time.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await isFirstRunSetupOpen())) redirect("/login");
  const { shopName } = await getSettings();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{shopName}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Create the owner account. Keep the password safe: it cannot be recovered.
        </p>
        <SetupForm />
      </div>
    </main>
  );
}
