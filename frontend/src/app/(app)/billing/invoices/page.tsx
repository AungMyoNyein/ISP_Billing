"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { usePaginated } from "@/hooks/usePaginated";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, Pagination, Table, inputCls } from "@/components/ui";
import type { Invoice } from "@/lib/types";

export default function InvoicesPage() {
  return (
    <Suspense>
      <InvoicesInner />
    </Suspense>
  );
}

function InvoicesInner() {
  const params = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, page, lastPage, total, loading, error, setPage, reload } = usePaginated<Invoice>("/invoices", {
    search, status, from, to,
  });
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Unpaid invoices past due date suspend the customer automatically" />
      <ErrorNote message={error ?? actionError} />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <form className="flex min-w-56 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}>
            <input className={inputCls} placeholder="Search invoice #, customer…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <select className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input className={`${inputCls} w-auto`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Billing date from" />
          <input className={`${inputCls} w-auto`} type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Billing date to" />
        </div>

        <Table
          headers={["Invoice Number", "Customer", "Plan", "Amount", "Billing Date", "Due Date", "Status", ""]}
          loading={loading}
          empty={data.length === 0}
        >
          {data.map((inv) => (
            <tr key={inv.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
              <td className="px-4 py-3">
                {inv.customer ? (
                  <Link className="text-blue-700" href={`/customers/${inv.customer.id}`}>
                    {inv.customer.name}
                    <span className="ml-1 text-xs text-slate-400">{inv.customer.customer_code}</span>
                  </Link>
                ) : "—"}
              </td>
              <td className="px-4 py-3">{inv.service_plan?.name ?? "—"}</td>
              <td className="px-4 py-3">{formatMoney(inv.amount)}</td>
              <td className="px-4 py-3">{formatDate(inv.billing_date)}</td>
              <td className="px-4 py-3">{formatDate(inv.due_date)}</td>
              <td className="px-4 py-3"><Badge value={inv.status} /></td>
              <td className="px-4 py-3 text-right">
                {inv.status !== "paid" && inv.status !== "cancelled" && (
                  <Button variant="secondary" onClick={() => setPaying(inv)}>Mark Paid</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>

      <Modal title={`Record payment — ${paying?.invoice_number ?? ""}`} open={!!paying} onClose={() => setPaying(null)}>
        {paying && (
          <PayForm
            invoice={paying}
            onDone={() => { setPaying(null); reload(); }}
            onError={setActionError}
          />
        )}
      </Modal>
    </div>
  );
}

function PayForm({ invoice, onDone, onError }: { invoice: Invoice; onDone: () => void; onError: (m: string) => void }) {
  const [amount, setAmount] = useState(String(invoice.amount));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/invoices/${invoice.id}/pay`, {
        method: "POST",
        body: { amount: Number(amount), method, reference: reference || null },
      });
      onDone();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Payment failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Customer <strong>{invoice.customer?.name}</strong> will be re-activated and RADIUS access enabled.
      </p>
      <Field label="Amount">
        <input className={inputCls} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Method">
        <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="mobile_money">Mobile Money</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Reference (optional)">
        <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Recording…" : "Record Payment"}</Button>
      </div>
    </form>
  );
}
