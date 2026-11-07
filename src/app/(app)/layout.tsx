import { AppNav } from "@/components/app-nav";
import { requireActor } from "@/server/auth";
import { getSettings } from "@/server/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const { shopName } = await getSettings();
  return (
    <div className="min-h-dvh">
      <AppNav shopName={shopName} name={actor.name} role={actor.role} />
      <main className="lg:pl-60">
        <div className="print-area mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
