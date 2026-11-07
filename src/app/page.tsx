import { redirect } from "next/navigation";
import { homePath } from "@/lib/permissions";
import { getActor } from "@/server/auth";

export default async function HomePage() {
  const actor = await getActor();
  redirect(actor ? homePath(actor.role) : "/login");
}
