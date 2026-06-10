"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, PageHeader, Table, inputCls } from "@/components/ui";
import type { OnlineSession } from "@/lib/types";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<OnlineSession[]>([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await api<{ data: OnlineSession[]; total: number }>("/sessions/online", { params: { search: q } });
      setSessions(res.data);
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search);
    const t = setInterval(() => load(search), 15000);
    return () => clearInterval(t);
  }, [load, search]);

  return (
    <div>
      <PageHeader
        title="Online Sessions"
        subtitle={`Live PPPoE sessions from RADIUS accounting${updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ""}`}
        actions={<Button variant="secondary" onClick={() => load(search)}>Refresh</Button>}
      />
      <ErrorNote message={error} />

      <Card>
        <div className="border-b border-slate-200 p-4">
          <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}>
            <input className={inputCls} placeholder="Search username, IP, MAC…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </div>
        <Table
          headers={["Username", "Customer", "Plan", "IP Address", "MAC", "NAS", "Started", "Uptime", "Download", "Upload"]}
          loading={loading && sessions.length === 0}
          empty={sessions.length === 0}
        >
          {sessions.map((s) => (
            <tr key={s.radacctid} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs font-medium">{s.username}</td>
              <td className="px-4 py-3">
                {s.customer ? (
                  <Link className="text-blue-700" href={`/customers/${s.customer.id}`}>
                    {s.customer.name} <Badge value={s.customer.status} />
                  </Link>
                ) : <span className="text-slate-400">unknown</span>}
              </td>
              <td className="px-4 py-3">{s.customer?.plan ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">{s.ip_address}</td>
              <td className="px-4 py-3 font-mono text-xs">{s.mac_address}</td>
              <td className="px-4 py-3 font-mono text-xs">{s.nas_ip}</td>
              <td className="px-4 py-3">{formatDateTime(s.started_at)}</td>
              <td className="px-4 py-3">{formatDuration(s.uptime_seconds)}</td>
              <td className="px-4 py-3">{formatBytes(s.download_bytes)}</td>
              <td className="px-4 py-3">{formatBytes(s.upload_bytes)}</td>
            </tr>
          ))}
        </Table>
        <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
          {sessions.length} active session(s) · auto-refreshes every 15s
        </div>
      </Card>
    </div>
  );
}
