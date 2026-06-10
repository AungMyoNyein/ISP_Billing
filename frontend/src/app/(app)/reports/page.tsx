"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Card, ErrorNote, PageHeader, StatCard, Table } from "@/components/ui";

interface RevenueRow { month: string; total: string | number; payments: number }
interface GrowthRow { month: string; customers: number }
interface PlanRow { id: number; name: string; price: string | number; customers: number }
interface Receivables { unpaid_total: number; unpaid_count: number; overdue_total: number; overdue_count: number }

export default function ReportsPage() {
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [growth, setGrowth] = useState<GrowthRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [receivables, setReceivables] = useState<Receivables | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<RevenueRow[]>("/reports/revenue", { params: { months: 12 } }).then(setRevenue).catch((e) => setError(e.message));
    api<GrowthRow[]>("/reports/customer-growth", { params: { months: 12 } }).then(setGrowth).catch(() => {});
    api<PlanRow[]>("/reports/plan-distribution").then(setPlans).catch(() => {});
    api<Receivables>("/reports/receivables").then(setReceivables).catch(() => {});
  }, []);

  const growthByMonth = new Map(growth.map((g) => [g.month, g.customers]));

  return (
    <div>
      <PageHeader title="Reports" subtitle="Revenue, growth and receivables" />
      <ErrorNote message={error} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unpaid Invoices" value={receivables?.unpaid_count ?? "…"} accent="text-amber-600" />
        <StatCard label="Unpaid Amount" value={receivables ? formatMoney(receivables.unpaid_total) : "…"} accent="text-amber-600" />
        <StatCard label="Overdue Invoices" value={receivables?.overdue_count ?? "…"} accent="text-rose-600" />
        <StatCard label="Overdue Amount" value={receivables ? formatMoney(receivables.overdue_total) : "…"} accent="text-rose-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="px-5 pt-4 text-sm font-semibold text-slate-700">Monthly revenue (last 12 months)</h2>
          <Table headers={["Month", "Payments", "New Customers", "Revenue"]} empty={revenue.length === 0}>
            {revenue.map((r) => (
              <tr key={r.month} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium">{r.month}</td>
                <td className="px-4 py-2.5">{r.payments}</td>
                <td className="px-4 py-2.5">{growthByMonth.get(r.month) ?? 0}</td>
                <td className="px-4 py-2.5 font-medium text-emerald-700">{formatMoney(Number(r.total))}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card>
          <h2 className="px-5 pt-4 text-sm font-semibold text-slate-700">Customers per plan</h2>
          <Table headers={["Plan", "Price", "Customers", ""]} empty={plans.length === 0}>
            {plans.map((p) => {
              const max = Math.max(...plans.map((x) => x.customers), 1);
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5">{formatMoney(p.price)}</td>
                  <td className="px-4 py-2.5">{p.customers}</td>
                  <td className="w-1/3 px-4 py-2.5">
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${(p.customers / max) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>
    </div>
  );
}
