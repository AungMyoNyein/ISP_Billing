"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/api";
import { Icon } from "@/components/icons";
import type { User } from "@/lib/types";

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Customers", href: "/customers", icon: "customers" },
  { label: "Service Plans", href: "/plans", icon: "plans" },
  {
    label: "Billing", icon: "billing", children: [
      { label: "Invoices", href: "/billing/invoices" },
      { label: "Payments", href: "/billing/payments" },
      { label: "Renewals", href: "/billing/renewals" },
      { label: "Expiring Customers", href: "/billing/expiring" },
      { label: "Suspended Customers", href: "/billing/suspended" },
    ],
  },
  {
    label: "Network", icon: "network", children: [
      { label: "Routers", href: "/network/routers" },
      { label: "Online Sessions", href: "/network/sessions" },
    ],
  },
  {
    label: "Administration", icon: "admin", children: [
      { label: "Reports", href: "/reports" },
      { label: "Users", href: "/admin/users" },
      { label: "Roles & Permissions", href: "/admin/roles" },
      { label: "System Settings", href: "/admin/settings" },
      { label: "Audit Logs", href: "/admin/audit-logs" },
      { label: "Backup & Restore", href: "/admin/backup" },
    ],
  },
  { label: "System Status", href: "/status", icon: "status" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);

  function toggleGroup(label: string) {
    setCollapsed((c) => ({ ...c, [label]: !c[label] }));
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const cached = localStorage.getItem("user");
    if (cached) setUser(JSON.parse(cached));
    api<User>("/auth/me")
      .then((u) => {
        setUser(u);
        localStorage.setItem("user", JSON.stringify(u));
      })
      .catch(() => {});
  }, [router]);

  // a tap on a nav link inside the mobile drawer should close it
  useEffect(() => setDrawerOpen(false), [pathname]);

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // token may already be invalid; clear it anyway
    }
    setToken(null);
    localStorage.removeItem("user");
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setDrawerOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform print:hidden lg:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-xs font-semibold tracking-tight text-white">
            IB
          </div>
          <p className="text-sm font-bold text-slate-900">ISP Billing</p>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
          >
            <Icon name="close" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 text-sm">
          {nav.map((item) =>
            item.children ? (
              <div key={item.label} className="mt-1 first:mt-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(item.label)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <Icon name={item.icon} className="h-4 w-4 text-slate-400" />
                  <span>{item.label}</span>
                  <Icon
                    name="chevron"
                    className={`ml-auto h-3.5 w-3.5 transition-transform ${collapsed[item.label] ? "-rotate-90" : ""}`}
                  />
                </button>
                {!collapsed[item.label] &&
                  item.children.map((child) => (
                    <NavLink key={child.href} href={child.href} active={pathname.startsWith(child.href)} indent>
                      {child.label}
                    </NavLink>
                  ))}
              </div>
            ) : (
              <NavLink key={item.href} href={item.href!} active={pathname.startsWith(item.href!)} icon={item.icon}>
                {item.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
              {(user?.name ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{user?.name ?? "…"}</p>
              <p className="truncate text-xs text-slate-400">{user?.role?.name ?? user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-2 w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-rose-600"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* print:ml-0 — with the sidebar hidden on paper, the 16rem gutter it
          reserves would otherwise push the page off the right edge */}
      <div className="print:ml-0 lg:ml-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur print:hidden lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <p className="text-sm font-bold text-slate-900">ISP Billing</p>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 print:max-w-none print:p-0 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, active, children, icon, indent }: {
  href: string; active: boolean; children: React.ReactNode; icon?: string; indent?: boolean;
}) {
  return (
    <Link
      href={href}
      // weight carries the hierarchy: top-level entries bold, nested children a
      // step lighter, so the sidebar still reads as two levels when every item
      // is emphasised
      className={`mb-0.5 flex items-center gap-2 rounded-md py-1.5 text-sm transition-colors ${
        indent ? "pl-8 pr-2.5 font-medium" : "px-2.5 font-bold"
      } ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {icon && <Icon name={icon} className={`h-4 w-4 ${active ? "text-blue-600" : "text-slate-400"}`} />}
      {children}
    </Link>
  );
}
