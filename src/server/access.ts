import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { can, type Permission } from "@/lib/permissions";
import { ForbiddenError } from "@/server/errors";

/** The signed-in user. Every service function takes one and checks it. */
export type Actor = { id: string; name: string; role: Role };

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) throw new ForbiddenError();
}
