"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginated } from "@/hooks/usePaginated";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Button, Card, ErrorNote, PageHeader, Pagination, Table, inputBaseCls, inputCls } from "@/components/ui";
import type { Payment } from "@/lib/types";
import { DateInput } from "@/components/DateInput";

export default function PaymentsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, page, lastPage, total, loading, error, setPage } = usePaginated<Payment>("/payments", {
    search, method, from, to,
  });

  return (
    <div>
      <PageHeader title="Payments" subtitle="All received payments" />
      <ErrorNote message={error} />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <form className="flex min-w-56 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}>
            <input className={inputCls} placeholder="Search payment #, reference, customer…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <select className={`${inputBaseCls} w-auto`} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All methods</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="other">Other</option>
          </select>
          <DateInput className="w-40" value={from} onChange={setFrom} title="From date" />
          <DateInput className="w-40" value={to} onChange={setTo} title="To date" />
        </div>

        <Table
          headers={["Payment #", "Customer", "Invoice", "Amount", "Method", "Reference", "Paid At", "Received By"]}
          loading={loading}
          empty={data.length === 0}
        >
          {data.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{p.payment_number}</td>
              <td className="px-4 py-3">
                {p.customer ? <Link className="text-blue-700" href={`/customers/${p.customer.id}`}>{p.customer.name}</Link> : "—"}
              </td>
              <td className="px-4 py-3">{p.invoice?.invoice_number ?? "—"}</td>
              <td className="px-4 py-3 font-medium">{formatMoney(p.amount)}</td>
              <td className="px-4 py-3 capitalize">{p.method.replace("_", " ")}</td>
              <td className="px-4 py-3">{p.reference ?? "—"}</td>
              <td className="px-4 py-3">{formatDateTime(p.paid_at)}</td>
              <td className="px-4 py-3">{p.receiver?.name ?? "—"}</td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>
    </div>
  );
}
