/**
 * The role and permission matrix. The server enforces it; the UI only reads it
 * to decide what to show.
 */
import type { Role } from "@/generated/prisma/enums";

export const PERMISSIONS = [
  "dashboard:view",
  "orders:view", // order and status details, no amounts
  "orders:update-status",
  "orders:complete", // the COMPLETED step is the counter handover
  "transactions:view", // amounts, balances and payment history
  "transactions:create",
  "transactions:edit",
  "transactions:void",
  "payments:view",
  "payments:collect",
  "payments:adjust", // reversals and refunds
  "expenses:view",
  "expenses:manage",
  "services:view",
  "services:manage",
  "customers:view",
  "customers:manage",
  "reports:daily",
  "reports:full",
  "settings:manage",
  "users:manage",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CASHIER_PERMISSIONS: Permission[] = [
  "dashboard:view",
  "orders:view",
  "orders:update-status",
  "orders:complete",
  "transactions:view",
  "transactions:create",
  "payments:view",
  "payments:collect",
  "services:view",
  "customers:view",
  "customers:manage",
  "reports:daily",
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...CASHIER_PERMISSIONS,
  "transactions:edit",
  "transactions:void",
  "payments:adjust",
  "expenses:view",
  "expenses:manage",
  "services:manage",
  "reports:full",
  "settings:manage",
];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(PERMISSIONS),
  ADMIN: new Set(ADMIN_PERMISSIONS),
  CASHIER: new Set(CASHIER_PERMISSIONS),
  STAFF: new Set<Permission>(["orders:view", "orders:update-status"]),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Where a role lands after signing in. */
export function homePath(role: Role): string {
  return can(role, "dashboard:view") ? "/dashboard" : "/transactions";
}
