"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: "📊" },
  { label: "Customers", href: "/customers", icon: "👥" },
  { label: "Service Plans", href: "/plans", icon: "📶" },
  {
    label: "Billing", icon: "💳", children: [
      { label: "Invoices", href: "/billing/invoices" },
      { label: "Payments", href: "/billing/payments" },
      { label: "Renewals", href: "/billing/renewals" },
      { label: "Expiring Customers", href: "/billing/expiring" },
      { label: "Suspended Customers", href: "/billing/suspended" },
    ],
  },
  {
    label: "Network", icon: "🌐", children: [
      { label: "Routers", href: "/network/routers" },
      { label: "Online Sessions", href: "/network/sessions" },
    ],
  },
  { label: "Reports", href: "/reports", icon: "📈" },
  {
    label: "Administration", icon: "⚙️", children: [
      { label: "Users", href: "/admin/users" },
      { label: "Roles & Permissions", href: "/admin/roles" },
      { label: "System Settings", href: "/admin/settings" },
      { label: "Audit Logs", href: "/admin/audit-logs" },
      { label: "Backup & Restore", href: "/admin/backup" },
    ],
  },
  { label: "System Status", href: "/status", icon: "🩺" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
    <div className="flex min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">IB</div>
          <div>
            <p className="text-sm font-semibold text-slate-900">ISP Billing</p>
            <p className="text-xs text-slate-400">Management System</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
          {nav.map((item) =>
            item.children ? (
              <div key={item.label} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(item.label)}
                  className="flex w-full items-center justify-between rounded-lg px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
                >
                  <span>
                    {item.icon} {item.label}
                  </span>
                  <span className="text-[10px]">{collapsed[item.label] ? "▸" : "▾"}</span>
                </button>
                {!collapsed[item.label] &&
                  item.children.map((child) => (
                    <NavLink key={child.href} href={child.href} active={pathname.startsWith(child.href)}>
                      {child.label}
                    </NavLink>
                  ))}
              </div>
            ) : (
              <NavLink key={item.href} href={item.href!} active={pathname.startsWith(item.href!)}>
                {item.icon} {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <p className="truncate text-sm font-medium text-slate-900">{user?.name ?? "…"}</p>
          <p className="truncate text-xs text-slate-400">{user?.role?.name ?? user?.email}</p>
          <button onClick={logout} className="mt-2 text-xs font-medium text-rose-600 hover:text-rose-700">
            Sign out
          </button>
        </div>
      </aside>
      <main className="ml-64 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`mb-0.5 block rounded-lg px-3 py-2 transition ${
        active ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}
