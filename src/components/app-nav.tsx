"use client";

import {
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  ScrollText,
  Settings,
  Shirt,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/labels";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; permission: Permission }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
  { href: "/transactions", label: "Transactions", icon: ClipboardList, permission: "orders:view" },
  { href: "/payments", label: "Payments", icon: CreditCard, permission: "payments:view" },
  { href: "/expenses", label: "Expenses", icon: ReceiptText, permission: "expenses:view" },
  { href: "/reports", label: "Reports", icon: BarChart3, permission: "reports:daily" },
  { href: "/services", label: "Services", icon: Shirt, permission: "services:view" },
  { href: "/customers", label: "Customers", icon: Users, permission: "customers:view" },
  { href: "/users", label: "Users", icon: UserCog, permission: "users:manage" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "settings:manage" },
  { href: "/audit-logs", label: "Audit logs", icon: ScrollText, permission: "audit:view" },
];

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV_ITEMS.filter((item) => can(role, item.permission)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-foreground focus-visible:outline-none",
                active && "bg-sidebar-accent text-sidebar-foreground",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ShopMark({ shopName }: { shopName: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Building2 className="size-4" aria-hidden />
      </span>
      <span className="truncate text-sm font-semibold">{shopName}</span>
    </div>
  );
}

function UserPanel({ name, role }: { name: string; role: Role }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-sidebar-accent p-3">
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium">{name}</p>
        <p className="text-xs text-sidebar-muted">{ROLE_LABELS[role]}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          // The auth server's own redirect names 127.0.0.1, which a phone cannot open.
          await signOut({ redirect: false });
          window.location.assign("/login");
        }}
        aria-label="Sign out"
        className="rounded-md p-2 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-foreground focus-visible:outline-none"
      >
        <LogOut className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function AppNav({ shopName, name, role }: { shopName: string; name: string; role: Role }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="p-4">
          <ShopMark shopName={shopName} />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks role={role} />
        </nav>
        <UserPanel name={name} role={role} />
      </aside>

      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-3 bg-sidebar px-4 text-sidebar-foreground lg:hidden">
        <ShopMark shopName={shopName} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="rounded-md p-2 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-foreground focus-visible:outline-none"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </header>

      {open ? (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground">
            <div className="flex items-center justify-between p-4">
              <ShopMark shopName={shopName} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-2 hover:bg-sidebar-accent"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
              <NavLinks role={role} onNavigate={() => setOpen(false)} />
            </nav>
            <UserPanel name={name} role={role} />
          </div>
        </div>
      ) : null}
    </>
  );
}
