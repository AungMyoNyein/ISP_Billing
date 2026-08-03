"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { usePaginated } from "@/hooks/usePaginated";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, PageHeader, Pagination, Table, inputCls } from "@/components/ui";
import { RenewDialog } from "@/components/RenewDialog";
import type { Customer } from "@/lib/types";

/**
 * Shared list for the Billing menu screens that show customers
 * (Renewals, Expiring, Suspended) with search filter + row actions.
 */
export function CustomerBillingList({ title, subtitle, endpoint, showDays, action }: {
  title: string;
  subtitle: string;
  endpoint: string;
  showDays?: boolean;
  action?: "renew" | "reconnect";
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState("7");
  const { data, page, lastPage, total, loading, error, setPage, reload } = usePaginated<Customer>(endpoint, {
    search, ...(showDays ? { days } : {}),
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Renewal opens a dialog rather than a confirm(), so the operator can set
  // the expiry date by hand; reconnect stays a plain confirmation.
  const [renewing, setRenewing] = useState<Customer | null>(null);

  async function run(customer: Customer) {
    if (!action) return;
    if (action === "renew") {
      setRenewing(customer);
      return;
    }
    if (!confirm(`Reconnect ${customer.name} and re-enable RADIUS access?`)) return;
    setBusyId(customer.id);
    setActionError(null);
    try {
      await api(`/customers/${customer.id}/reconnect`, { method: "POST" });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <ErrorNote message={error ?? actionError} />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <form className="flex min-w-56 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}>
            <input className={inputCls} placeholder="Search customers…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          {showDays && (
            <select className={`${inputCls} w-auto`} value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="3">Next 3 days</option>
              <option value="7">Next 7 days</option>
              <option value="14">Next 14 days</option>
              <option value="30">Next 30 days</option>
            </select>
          )}
        </div>

        <Table
          headers={["Customer ID", "Name", "Username", "Plan", "Price", "Expiry Date", "Status", action ? "" : undefined].filter((h): h is string => h !== undefined)}
          loading={loading}
          empty={data.length === 0}
        >
          {data.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-blue-700"><Link href={`/customers/${c.id}`}>{c.customer_code}</Link></td>
              <td className="px-4 py-3">{c.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{c.username}</td>
              <td className="px-4 py-3">{c.service_plan?.name ?? "—"}</td>
              <td className="px-4 py-3">{c.service_plan ? formatMoney(c.service_plan.price) : "—"}</td>
              <td className="px-4 py-3">{formatDate(c.expiry_date)}</td>
              <td className="px-4 py-3"><Badge value={c.status} /></td>
              {action && (
                <td className="px-4 py-3 text-right">
                  <Button variant="secondary" disabled={busyId === c.id} onClick={() => run(c)}>
                    {action === "renew" ? "Renew" : "Reconnect"}
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </Table>
        <Pagination page={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>

      <RenewDialog
        open={renewing !== null}
        customerId={renewing?.id ?? null}
        customerName={renewing?.name}
        planName={renewing?.service_plan?.name}
        validityDays={renewing?.service_plan?.validity_days}
        onClose={() => setRenewing(null)}
        onDone={reload}
      />
    </div>
  );
}
