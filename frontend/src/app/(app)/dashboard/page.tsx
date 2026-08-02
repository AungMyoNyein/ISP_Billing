"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Card, PageHeader, StatCard, ErrorNote } from "@/components/ui";
import type { DashboardStats } from "@/lib/types";

interface RevenueRow { month: string; total: string | number; payments: number }
interface GrowthRow { month: string; customers: number }

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [growth, setGrowth] = useState<GrowthRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DashboardStats>("/dashboard/stats").then(setStats).catch((e) => setError(e.message));
    api<RevenueRow[]>("/reports/revenue", { params: { months: 6 } }).then(setRevenue).catch(() => {});
    api<GrowthRow[]>("/reports/customer-growth", { params: { months: 6 } }).then(setGrowth).catch(() => {});
    const t = setInterval(() => {
      api<DashboardStats>("/dashboard/stats").then(setStats).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live overview of customers, sessions and billing" />
      <ErrorNote message={error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard href="/customers" label="Total Customers" value={stats?.total_customers ?? "…"} hint="All accounts" />
        <StatCard href="/customers?status=active" label="Active Customers" value={stats?.active_customers ?? "…"} accent="text-emerald-600" hint="Billing active" />
        <StatCard href="/network/sessions" label="Online Users" value={stats?.online_users ?? "…"} accent="text-blue-600" hint="PPPoE connected now" />
        <StatCard href="/billing/suspended" label="Suspended Customers" value={stats?.suspended_customers ?? "…"} accent="text-rose-600" hint="Auth blocked" />
        <StatCard href="/customers?status=expired" label="Expired Customers" value={stats?.expired_customers ?? "…"} accent="text-orange-600" hint="Past validity" />
        <StatCard href="/billing/expiring" label="Expire in 7 Days" value={stats?.expiring_in_7_days ?? "…"} accent="text-amber-600" hint="Renewal due soon" />
        <StatCard label="New Customers This Month" value={stats?.new_customers_this_month ?? "…"} hint="Signed up since the 1st" />
        <StatCard label="Revenue This Month" value={stats ? formatMoney(stats.revenue_this_month) : "…"} accent="text-emerald-700" hint={`${stats?.unpaid_invoices ?? 0} unpaid invoice(s)`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Revenue — last 6 months</h2>
          <BarChart
            data={revenue.map((r) => ({ label: r.month.slice(2), value: Number(r.total) }))}
            format={(v) => formatMoney(v)}
            color="bg-emerald-500"
          />
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">New customers — last 6 months</h2>
          <BarChart
            data={growth.map((g) => ({ label: g.month.slice(2), value: g.customers }))}
            format={(v) => `${v} customer(s)`}
            color="bg-blue-500"
          />
        </Card>
      </div>
    </div>
  );
}

function BarChart({ data, format, color }: {
  data: Array<{ label: string; value: number }>;
  format: (v: number) => string;
  color: string;
}) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-slate-400">No data yet.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  // bar heights are in px: a % height would resolve against the auto-height
  // flex column and collapse every bar to its 2px floor
  const barArea = 128;
  return (
    <div className="flex h-44 items-end gap-3">
      {data.map((d) => (
        <div key={d.label} className="group flex flex-1 flex-col items-center gap-1.5" title={format(d.value)}>
          <span className="text-[10px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">{format(d.value)}</span>
          <div
            className={`w-full rounded-md opacity-90 transition-opacity group-hover:opacity-100 ${color}`}
            style={{ height: `${Math.max((d.value / max) * barArea, 3)}px` }}
          />
          <span className="text-xs text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
