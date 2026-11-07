import Link from "next/link";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { getSettings } from "@/server/settings";
import { INVALID_RESET_LINK, isResetTokenUsable } from "@/server/password-reset";

export const metadata = { title: "Reset password" };

// Reads the database on every visit; a link can be used up at any moment.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: rawToken } = await searchParams;
  const token = typeof rawToken === "string" && rawToken.length <= 200 ? rawToken : "";
  const [{ shopName }, usable] = await Promise.all([
    getSettings(),
    token ? isResetTokenUsable(token) : Promise.resolve(false),
  ]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{shopName}</h1>
        {usable ? (
          <>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">
              Choose a new password. Your old password stops working once you save.
            </p>
            <ResetPasswordForm token={token} />
          </>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
            >
              {INVALID_RESET_LINK}
            </p>
            <Link
              href="/forgot-password"
              className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Send a new reset link
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
