"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, ErrorNote, PageHeader, Table } from "@/components/ui";
import type { SystemStatus } from "@/lib/types";

export default function StatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<SystemStatus>("/status")
      .then(setStatus)
      .catch((e) => setError(e.message));
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
      />
      <ErrorNote message={error} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard
          label="NAS Routers"
          ok={!!status && status.routers_total > 0}
          detail={status ? `${status.routers_active} / ${status.routers_total} with active sessions` : "…"}
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
        <h2 className="px-5 pt-4 text-sm font-semibold text-slate-700">NAS Activity (from RADIUS accounting)</h2>
        <Table headers={["Router", "NAS IP", "Status", "Online Sessions", "Customers", "Last Accounting Activity"]} empty={!status || status.routers.length === 0}>
          {status?.routers.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{r.nas_ip}</td>
              <td className="px-4 py-3"><Badge value={r.status} /></td>
              <td className="px-4 py-3">{r.online_sessions}</td>
              <td className="px-4 py-3">{r.customers_count}</td>
              <td className="px-4 py-3">{formatDateTime(r.last_seen_at)}</td>
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
