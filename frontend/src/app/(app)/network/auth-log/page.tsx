"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginated } from "@/hooks/usePaginated";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, PageHeader, Pagination, Table, inputBaseCls } from "@/components/ui";
import type { AuthAttempt } from "@/lib/types";

const REPLIES = [
  { value: "", label: "All results" },
  { value: "Access-Reject", label: "Rejected only" },
  { value: "Access-Accept", label: "Accepted only" },
];

export default function AuthLogPage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [reply, setReply] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, page, lastPage, total, loading, error, setPage, reload } = usePaginated<AuthAttempt>(
    "/sessions/auth-log",
    { search, reply, from, to },
  );

  return (
    <div>
      <PageHeader
        title="Authentication Log"
        subtitle="Every Access-Accept and Access-Reject FreeRADIUS recorded — the only trace a failed login leaves"
        actions={<Button variant="secondary" onClick={reload}>Refresh</Button>}
      />
      <ErrorNote message={error} />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput);
            }}
          >
            <input
              className={`${inputBaseCls} w-56`}
              placeholder="Search username…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <select className={`${inputBaseCls} w-auto`} value={reply} onChange={(e) => setReply(e.target.value)}>
            {REPLIES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <input className={`${inputBaseCls} w-auto`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className={`${inputBaseCls} w-auto`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <Table headers={["When", "Username", "Result", "Customer", "Plan"]} loading={loading} empty={data.length === 0}>
          {data.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3">{formatDateTime(a.authenticated_at)}</td>
              <td className="px-4 py-3 font-mono text-xs font-medium">{a.username}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    a.accepted ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {a.reply}
                </span>
              </td>
              <td className="px-4 py-3">
                {a.customer ? (
                  <Link className="text-blue-700" href={`/customers/${a.customer.id}`}>
                    {a.customer.name} <Badge value={a.customer.status} />
                  </Link>
                ) : (
                  <span className="text-slate-400">unknown</span>
                )}
              </td>
              <td className="px-4 py-3">{a.customer?.plan ?? "—"}</td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>
    </div>
  );
}
