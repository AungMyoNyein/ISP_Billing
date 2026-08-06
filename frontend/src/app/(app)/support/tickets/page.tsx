"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { usePaginated } from "@/hooks/usePaginated";
import { formatDateTime, humanize } from "@/lib/format";
import {
  Badge, Button, Card, ErrorNote, Modal, PageHeader, Pagination, Table, inputBaseCls, inputCls,
} from "@/components/ui";
import { DateInput } from "@/components/DateInput";
import { TicketForm } from "@/components/TicketForm";
import type { SupportTicket, TicketOptions } from "@/lib/types";

export default function TicketsPage() {
  return (
    <Suspense>
      <TicketsInner />
    </Suspense>
  );
}

function TicketsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [options, setOptions] = useState<TicketOptions | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  // the dashboard and the customer tab both link in with ?status=…, so the
  // filter starts from the URL rather than from a fixed default
  const [status, setStatus] = useState(params.get("status") ?? "unresolved");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [assignedTo, setAssignedTo] = useState(params.get("assigned_to") ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [creating, setCreating] = useState(false);

  const { data, page, lastPage, total, loading, error, setPage, reload } = usePaginated<SupportTicket>(
    "/tickets",
    { search, status, priority, category, assigned_to: assignedTo, from, to },
  );

  useEffect(() => {
    api<TicketOptions>("/tickets/filter-options").then(setOptions).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader
        title="Support Tickets"
        subtitle="Customer issues reported to the help desk"
        actions={<Button onClick={() => setCreating(true)}>+ New Ticket</Button>}
      />
      <ErrorNote message={error} />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <form className="flex min-w-56 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}>
            <input
              className={inputCls}
              placeholder="Search ticket #, subject, customer…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <select className={`${inputBaseCls} w-auto capitalize`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="unresolved">Unresolved (open queue)</option>
            {(options?.statuses ?? []).map((s) => (
              <option key={s} value={s} className="capitalize">{humanize(s)}</option>
            ))}
          </select>
          <select className={`${inputBaseCls} w-auto capitalize`} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">All priorities</option>
            {(options?.priorities ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className={`${inputBaseCls} w-auto capitalize`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {(options?.categories ?? []).map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
          </select>
          <select className={`${inputBaseCls} w-auto`} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {(options?.agents ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <DateInput className="w-40" value={from} onChange={setFrom} title="Opened from" />
          <DateInput className="w-40" value={to} onChange={setTo} title="Opened to" />
        </div>

        <Table
          headers={["Ticket #", "Customer", "Subject", "Category", "Priority", "Status", "Assigned To", "Opened", "Replies"]}
          loading={loading}
          empty={data.length === 0}
        >
          {data.map((t) => (
            <tr
              key={t.id}
              onClick={() => router.push(`/support/tickets/${t.id}`)}
              className="cursor-pointer hover:bg-slate-50"
            >
              <td className="px-4 py-3 font-medium whitespace-nowrap text-blue-700">{t.ticket_number}</td>
              <td className="px-4 py-3">
                {t.customer ? (
                  <Link
                    className="text-blue-700"
                    href={`/customers/${t.customer.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t.customer.name}
                    <span className="ml-1 text-xs text-slate-400">{t.customer.customer_code}</span>
                  </Link>
                ) : "—"}
              </td>
              <td className="px-4 py-3">
                <span className="block max-w-xs truncate">{t.subject}</span>
              </td>
              <td className="px-4 py-3 capitalize">{humanize(t.category)}</td>
              <td className="px-4 py-3"><Badge value={t.priority} /></td>
              <td className="px-4 py-3"><Badge value={humanize(t.status)} /></td>
              <td className="px-4 py-3">{t.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(t.created_at)}</td>
              <td className="px-4 py-3 tabular-nums">{t.replies_count ?? 0}</td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>

      <Modal title="New Support Ticket" open={creating} onClose={() => setCreating(false)} wide>
        <TicketForm
          options={options ?? undefined}
          onSaved={(t) => { setCreating(false); reload(); router.push(`/support/tickets/${t.id}`); }}
        />
      </Modal>
    </div>
  );
}
