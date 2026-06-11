"use client";

import { useState } from "react";
import { usePaginated } from "@/hooks/usePaginated";
import { formatDateTime } from "@/lib/format";
import { Card, ErrorNote, PageHeader, Pagination, Table, inputBaseCls, inputCls } from "@/components/ui";
import type { AuditLog } from "@/lib/types";

export default function AuditLogsPage() {
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, page, lastPage, total, loading, error, setPage } = usePaginated<AuditLog>("/audit-logs", { action, from, to });

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Every significant action recorded by the system" />
      <ErrorNote message={error} />

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <input className={`${inputBaseCls} w-56`} placeholder="Filter by action (e.g. login)" value={action} onChange={(e) => setAction(e.target.value)} />
          <input className={`${inputBaseCls} w-auto`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className={`${inputBaseCls} w-auto`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Table headers={["When", "User", "Action", "Entity", "Details", "IP"]} loading={loading} empty={data.length === 0}>
          {data.map((log) => (
            <tr key={log.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
              <td className="px-4 py-3">{log.user?.name ?? "system"}</td>
              <td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{log.action}</span></td>
              <td className="px-4 py-3">{log.entity_type ? `${log.entity_type} #${log.entity_id}` : "—"}</td>
              <td className="max-w-md truncate px-4 py-3 font-mono text-xs text-slate-500" title={JSON.stringify(log.changes)}>
                {log.changes ? JSON.stringify(log.changes) : "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs">{log.ip_address ?? "—"}</td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>
    </div>
  );
}
