"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, PageHeader, Table } from "@/components/ui";
import type { SystemStatus } from "@/lib/types";

export default function StatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const load = useCallback((live = false) => {
    if (live) setProbing(true);
    api<SystemStatus>("/status", { params: live ? { live: 1 } : {} })
      .then(setStatus)
      .catch((e) => setError(e.message))
      .finally(() => setProbing(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="System Status"
        subtitle={status ? `Checked ${formatDateTime(status.checked_at)}` : "Loading…"}
        actions={<Button variant="secondary" disabled={probing} onClick={() => load(true)}>{probing ? "Probing routers…" : "Probe routers now"}</Button>}
      />
      <ErrorNote message={error} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard
          label="Connected MikroTik Routers"
          ok={!!status && status.routers_online === status.routers_total && status.routers_total > 0}
          detail={status ? `${status.routers_online} / ${status.routers_total} online` : "…"}
        />
        <HealthCard
          label="FreeRADIUS"
          ok={!!status?.freeradius.database_reachable}
          detail={status?.freeradius.database_reachable
            ? `${status.freeradius.online_sessions ?? 0} online session(s)`
            : "RADIUS DB unreachable"}
        />
        <HealthCard
          label="Database"
          ok={!!status?.database.main && !!status?.database.radius}
          detail={status ? `main: ${status.database.main ? "up" : "down"} · radius: ${status.database.radius ? "up" : "down"}` : "…"}
        />
        <HealthCard
          label="SmartOLT"
          ok={!!status?.smartolt.configured}
          detail={status?.smartolt.configured ? "API configured" : "Not configured"}
          neutral={!status?.smartolt.configured}
        />
      </div>

      <Card>
        <h2 className="px-5 pt-4 text-sm font-semibold text-slate-700">Router Status</h2>
        <Table headers={["Router", "Host", "Status", "Customers", "Last Seen", "Board", "Uptime", "CPU"]} empty={!status || status.routers.length === 0}>
          {status?.routers.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{r.host}</td>
              <td className="px-4 py-3"><Badge value={r.status} /></td>
              <td className="px-4 py-3">{r.customers_count}</td>
              <td className="px-4 py-3">{formatDateTime(r.last_seen_at)}</td>
              <td className="px-4 py-3">{r.resource?.["board-name"] ?? "—"}</td>
              <td className="px-4 py-3">{r.resource?.uptime ?? "—"}</td>
              <td className="px-4 py-3">{r.resource?.["cpu-load"] ? `${r.resource["cpu-load"]}%` : "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function HealthCard({ label, ok, detail, neutral }: { label: string; ok: boolean; detail: string; neutral?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <span className={`h-3 w-3 rounded-full ${neutral ? "bg-slate-300" : ok ? "bg-emerald-500" : "bg-rose-500"}`} />
      </div>
      <p className="mt-2 text-lg font-semibold text-slate-900">{neutral ? "—" : ok ? "Healthy" : "Attention"}</p>
      <p className="mt-0.5 text-xs text-slate-400">{detail}</p>
    </Card>
  );
}
