"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { usePaginated } from "@/hooks/usePaginated";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, PageHeader, Pagination, Table, inputCls } from "@/components/ui";
import type { Customer, ServicePlan } from "@/lib/types";

interface FilterOptions { dn_zones: string[]; sn_odbs: string[]; statuses: string[] }

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersInner />
    </Suspense>
  );
}

function CustomersInner() {
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [dnZone, setDnZone] = useState("");
  const [snOdb, setSnOdb] = useState("");
  const [planId, setPlanId] = useState("");
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [plans, setPlans] = useState<ServicePlan[]>([]);

  const { data, page, lastPage, total, loading, error, setPage } = usePaginated<Customer>("/customers", {
    search, status, dn_zone: dnZone, sn_odb: snOdb, service_plan_id: planId,
  });

  useEffect(() => {
    api<FilterOptions>("/customers/filter-options").then(setOptions).catch(() => {});
    api<{ data: ServicePlan[] }>("/plans", { params: { per_page: 100 } }).then((r) => setPlans(r.data)).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="CRM — manage subscribers and their connections"
        actions={<Link href="/customers/new"><Button>+ New Customer</Button></Link>}
      />
      <ErrorNote message={error} />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <form
            className="flex min-w-56 flex-1 gap-2"
            onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}
          >
            <input
              className={inputCls}
              placeholder="Search ID, name, username, phone, address…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <select className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {options?.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={`${inputCls} w-auto`} value={dnZone} onChange={(e) => setDnZone(e.target.value)}>
            <option value="">All DN zones</option>
            {options?.dn_zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <select className={`${inputCls} w-auto`} value={snOdb} onChange={(e) => setSnOdb(e.target.value)}>
            <option value="">All SN/ODB</option>
            {options?.sn_odbs.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className={`${inputCls} w-auto`} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">All plans</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <Table
          headers={["Customer ID", "Name", "Username", "Phone", "DN Zone", "SN ODB", "Plan", "Expiry", "Status"]}
          loading={loading}
          empty={data.length === 0}
        >
          {data.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-blue-700">
                <Link href={`/customers/${c.id}`}>{c.customer_code}</Link>
              </td>
              <td className="px-4 py-3">{c.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{c.username}</td>
              <td className="px-4 py-3">{c.phone ?? "—"}</td>
              <td className="px-4 py-3">{c.dn_zone ?? "—"}</td>
              <td className="px-4 py-3">{c.sn_odb ?? "—"}</td>
              <td className="px-4 py-3">{c.service_plan?.name ?? "—"}</td>
              <td className="px-4 py-3">{formatDate(c.expiry_date)}</td>
              <td className="px-4 py-3"><Badge value={c.status} /></td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>
    </div>
  );
}
