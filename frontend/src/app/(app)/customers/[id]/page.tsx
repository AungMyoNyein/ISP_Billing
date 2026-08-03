"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatBytes, formatDate, formatDateTime, formatDuration, formatMoney } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Modal, PageHeader, Table } from "@/components/ui";
import { CustomerForm } from "@/components/CustomerForm";
import { RenewDialog } from "@/components/RenewDialog";
import type { Customer, Invoice } from "@/lib/types";

interface UsageDay { date: string; download_bytes: number; upload_bytes: number; sessions: number }
interface UsageSession {
  radacctid: number; acctstarttime: string | null; acctstoptime: string | null;
  acctsessiontime: number | null; acctinputoctets: number | null; acctoutputoctets: number | null;
  framedipaddress: string; callingstationid: string; nasipaddress: string;
}
interface UsageAuthAttempt { id: number; reply: string; authdate: string | null }
interface Presence {
  online: boolean;
  session_open: boolean;
  last_activity: string | null;
  last_activity_age_seconds: number | null;
  stale_after_minutes: number;
}
interface Usage {
  daily: UsageDay[]; sessions: UsageSession[]; auth_log: UsageAuthAttempt[];
  online: boolean; presence?: Presence;
}

const TABS = ["Overview", "Bandwidth Usage", "Invoices"] as const;

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageDays, setUsageDays] = useState(30);
  const [usageLoading, setUsageLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Customer>(`/customers/${id}`).then(setCustomer).catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  // refetch whenever the range changes, but keep the previous data on screen
  // while it loads so the card holds its frame instead of collapsing
  useEffect(() => {
    if (tab !== "Bandwidth Usage") return;
    setUsageLoading(true);
    api<Usage>(`/customers/${id}/usage`, { params: { days: usageDays } })
      .then(setUsage)
      .catch((e) => setError(e.message))
      .finally(() => setUsageLoading(false));
  }, [tab, id, usageDays]);

  useEffect(() => {
    if (tab === "Invoices" && invoices.length === 0) {
      api<{ data: Invoice[] }>("/invoices", { params: { customer_id: id, per_page: 50 } })
        .then((r) => setInvoices(r.data)).catch((e) => setError(e.message));
    }
  }, [tab, id, invoices.length]);

  async function action(path: string, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    try {
      await api(`/customers/${id}/${path}`, { method: "POST" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }


  async function remove() {
    if (!confirm("Delete this customer? RADIUS access will be removed.")) return;
    try {
      await api(`/customers/${id}`, { method: "DELETE" });
      router.push("/customers");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (!customer) {
    return <div className="py-20 text-center text-slate-400">{error ?? "Loading…"}</div>;
  }

  return (
    <div>
      <PageHeader
        title={`${customer.name}`}
        subtitle={`${customer.customer_code} · ${customer.username}`}
        actions={
          <>
            {customer.online && <Badge value="online" />}
            <Badge value={customer.status} />
            <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit</Button>
            <Button variant="secondary" onClick={() => setRenewOpen(true)} disabled={busy}>Renew</Button>
            {customer.status === "suspended" ? (
              <Button onClick={() => action("reconnect", "Reconnect this customer and re-enable RADIUS access?")} disabled={busy}>Reconnect</Button>
            ) : (
              <Button variant="danger" onClick={() => action("suspend", "Suspend this customer and disable RADIUS access?")} disabled={busy}>Suspend</Button>
            )}
            <Button variant="ghost" onClick={remove}>Delete</Button>
          </>
        }
      />
      <ErrorNote message={error} />

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <Overview customer={customer} />}
      {tab === "Bandwidth Usage" && (
        <UsageTab usage={usage} days={usageDays} onDays={setUsageDays} loading={usageLoading} />
      )}
      {tab === "Invoices" && <InvoicesTab invoices={invoices} />}

      <Modal title="Edit Customer" open={editOpen} onClose={() => setEditOpen(false)} wide>
        <CustomerForm
          customer={customer}
          onSaved={() => { setEditOpen(false); load(); }}
        />
      </Modal>

      <RenewDialog
        open={renewOpen}
        customerId={customer.id}
        customerName={customer.name}
        planName={customer.service_plan?.name}
        validityDays={customer.service_plan?.validity_days}
        onClose={() => setRenewOpen(false)}
        onDone={() => { setInvoices([]); setTab("Invoices"); load(); }}
      />
    </div>
  );
}

function Overview({ customer }: { customer: Customer }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Customer ID", customer.customer_code],
    ["Username", <span key="u" className="font-mono">{customer.username}</span>],
    ["Password", <span key="p" className="font-mono">{customer.radius_password ?? "••••••"}</span>],
    ["Phone", customer.phone ?? "—"],
    ["Address", customer.address ?? "—"],
    ["DN Zone", customer.dn_zone ?? "—"],
    ["SN ODB", customer.sn_odb ?? "—"],
    ["GPS Location", customer.gps_location ? (
      <a key="g" className="text-blue-700 underline" target="_blank" rel="noreferrer"
        href={`https://maps.google.com/?q=${customer.gps_location}`}>{customer.gps_location}</a>
    ) : "—"],
    ["Service Plan", customer.service_plan ? `${customer.service_plan.name} (${formatMoney(customer.service_plan.price)}/mo)` : "—"],
    ["Router", customer.router?.name ?? "—"],
    ["SmartOLT ONU", customer.smartolt_onu_sn ?? "—"],
    ["Activation Date", formatDate(customer.activation_date)],
    ["Expiry Date", formatDate(customer.expiry_date)],
    ["Last Renewed", formatDateTime(customer.last_renewed_at)],
  ];

  return (
    // Notes sits underneath rather than beside the details: as a grid column
    // it stretched to the full height of the 14-row card next to it, which is
    // a lot of empty box for one line of text.
    <div className="space-y-4">
      <Card className="p-5">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2 text-sm">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="px-5 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{customer.notes || "No notes."}</p>
      </Card>
    </div>
  );
}

const RANGES = [7, 30, 90] as const;

/**
 * Series colours are fixed to download → blue, upload → green, and never
 * reassigned when the range changes. Both steps clear the 3:1 contrast floor
 * against a white card and stay apart under deuteranopia and protanopia — the
 * emerald-400 used before was too light to pass either.
 */
const DOWNLOAD = "#2563eb";
const UPLOAD = "#059669";

function UsageTab({ usage, days, onDays, loading }: {
  usage: Usage | null; days: number; onDays: (d: number) => void; loading: boolean;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");

  if (!usage) return <div className="py-16 text-center text-slate-400">Loading usage from RADIUS accounting…</div>;

  const totalDown = usage.daily.reduce((s, d) => s + d.download_bytes, 0);
  const totalUp = usage.daily.reduce((s, d) => s + d.upload_bytes, 0);

  return (
    <div className="space-y-4">
      {/* one filter row above everything it scopes: presets first, and the
          totals below re-read against the same slice */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onDays(r)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                days === r ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {r} days
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                view === v ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <p className="text-xs text-slate-500">Download ({days} days)</p>
          <p className="text-xl font-semibold tabular-nums" style={{ color: DOWNLOAD }}>{formatBytes(totalDown)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-slate-500">Upload ({days} days)</p>
          <p className="text-xl font-semibold tabular-nums" style={{ color: UPLOAD }}>{formatBytes(totalUp)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-slate-500">Currently</p>
          <PresenceValue usage={usage} />
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Daily usage — last {days} days</h3>
        {usage.daily.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No accounting data for this range.</p>
        ) : view === "chart" ? (
          // holds its previous render at reduced opacity while refetching, so
          // switching range never collapses the card
          <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <UsageChart daily={usage.daily} />
          </div>
        ) : (
          <UsageTable daily={usage.daily} />
        )}
      </Card>

      <Card>
        <h3 className="px-5 pt-4 text-sm font-semibold text-slate-700">Recent sessions</h3>
        <Table headers={["Started", "Stopped", "Duration", "IP Address", "MAC", "NAS", "Download", "Upload"]} empty={usage.sessions.length === 0}>
          {usage.sessions.map((s) => (
            <tr key={s.radacctid} className="hover:bg-slate-50">
              <td className="px-4 py-2.5">{formatDateTime(s.acctstarttime)}</td>
              <td className="px-4 py-2.5">{s.acctstoptime ? formatDateTime(s.acctstoptime) : <Badge value="online" />}</td>
              <td className="px-4 py-2.5">{formatDuration(s.acctsessiontime)}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{s.framedipaddress}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{s.callingstationid}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{s.nasipaddress}</td>
              <td className="px-4 py-2.5">{formatBytes(s.acctoutputoctets ?? 0)}</td>
              <td className="px-4 py-2.5">{formatBytes(s.acctinputoctets ?? 0)}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <h3 className="px-5 pt-4 text-sm font-semibold text-slate-700">
          Recent authentication attempts
          <span className="ml-2 font-normal text-slate-400">rejects never reach the session list above</span>
        </h3>
        <Table headers={["When", "Result"]} empty={usage.auth_log.length === 0}>
          {usage.auth_log.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50">
              <td className="px-4 py-2.5">{formatDateTime(a.authdate)}</td>
              <td className="px-4 py-2.5">
                <AuthReply reply={a.reply} />
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function AuthReply({ reply }: { reply: string }) {
  const accepted = reply === "Access-Accept";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        accepted ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
      }`}
    >
      {reply}
    </span>
  );
}

/**
 * Stacked column per day: download at the baseline, upload on top, separated
 * by a 2px gap in the surface colour rather than a border — a stroke round
 * each segment would be data-weight ink that isn't data.
 */
/**
 * "Offline" alone cannot be acted on. A session the NAS stopped sending
 * interim updates for is hidden by the freshness check and looks exactly
 * like one that disconnected — while the chart beside it keeps filling,
 * because usage is read from the same rows with no freshness condition.
 * Saying which, and how stale, is the difference between "the customer
 * left" and "this router is not sending Acct-Interim-Interval updates".
 */
function PresenceValue({ usage }: { usage: Usage }) {
  const p = usage.presence;

  if (usage.online) return <p className="text-xl font-semibold text-emerald-600">Online</p>;

  if (p?.session_open) {
    return (
      <>
        <p className="text-xl font-semibold text-amber-600">Idle</p>
        <p className="mt-0.5 text-xs text-slate-500">
          session open, no accounting for {formatDuration(p.last_activity_age_seconds)}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-xl font-semibold text-slate-400">Offline</p>
      {p?.last_activity_age_seconds != null && (
        <p className="mt-0.5 text-xs text-slate-500">last seen {formatDuration(p.last_activity_age_seconds)} ago</p>
      )}
    </>
  );
}

function UsageChart({ daily }: { daily: UsageDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...daily.map((d) => d.download_bytes + d.upload_bytes), 1);
  const active = hover === null ? null : daily[hover];

  return (
    <div>
      <div className="relative">
        {/* recessive hairline gridlines carry the values not directly labelled */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[1, 0.5, 0].map((f) => (
            <div key={f} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-slate-400">
                {formatBytes(max * f)}
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
          ))}
        </div>

        <div className="relative ml-[4.5rem] flex h-48 items-end gap-[2px]">
          {daily.map((d, i) => {
            const downPct = (d.download_bytes / max) * 100;
            const upPct = (d.upload_bytes / max) * 100;

            return (
              <div
                key={d.date}
                className="relative flex h-full flex-1 cursor-default flex-col justify-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {/* hit target spans the full column height, not just the paint */}
                <div className="absolute inset-0" />
                {upPct > 0 && (
                  <div
                    className="w-full max-w-6 self-center rounded-t-[4px]"
                    style={{ height: `${upPct}%`, backgroundColor: UPLOAD, marginBottom: downPct > 0 ? 2 : 0, opacity: hover === i ? 1 : 0.92 }}
                  />
                )}
                {downPct > 0 && (
                  <div
                    className={`w-full max-w-6 self-center ${upPct > 0 ? "" : "rounded-t-[4px]"}`}
                    style={{ height: `${downPct}%`, backgroundColor: DOWNLOAD, opacity: hover === i ? 1 : 0.92 }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {active && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `calc(4.5rem + ${((hover! + 0.5) / daily.length) * 100}%)` }}
          >
            <p className="mb-1 font-medium text-slate-500">{formatDate(active.date)}</p>
            <p className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: DOWNLOAD }} />
              <span className="font-semibold tabular-nums text-slate-900">{formatBytes(active.download_bytes)}</span>
              <span className="text-slate-500">Download</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: UPLOAD }} />
              <span className="font-semibold tabular-nums text-slate-900">{formatBytes(active.upload_bytes)}</span>
              <span className="text-slate-500">Upload</span>
            </p>
          </div>
        )}
      </div>

      <div className="ml-[4.5rem] mt-2 flex justify-between text-[10px] text-slate-400">
        <span>{formatDate(daily[0]?.date)}</span>
        <span>{formatDate(daily[daily.length - 1]?.date)}</span>
      </div>

      <div className="ml-[4.5rem] mt-3 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: DOWNLOAD }} />Download
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: UPLOAD }} />Upload
        </span>
      </div>
    </div>
  );
}

/** Same numbers without hovering — keyboard and screen-reader route to the chart. */
function UsageTable({ daily }: { daily: UsageDay[] }) {
  return (
    <div className="-mx-5 -mb-5">
      <Table headers={["Date", "Download", "Upload", "Total", "Sessions"]} empty={daily.length === 0}>
        {[...daily].reverse().map((d) => (
          <tr key={d.date} className="hover:bg-slate-50">
            <td className="px-4 py-2.5">{formatDate(d.date)}</td>
            <td className="px-4 py-2.5 tabular-nums">{formatBytes(d.download_bytes)}</td>
            <td className="px-4 py-2.5 tabular-nums">{formatBytes(d.upload_bytes)}</td>
            <td className="px-4 py-2.5 tabular-nums">{formatBytes(d.download_bytes + d.upload_bytes)}</td>
            <td className="px-4 py-2.5 tabular-nums">{d.sessions}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function InvoicesTab({ invoices }: { invoices: Invoice[] }) {
  return (
    <Card>
      <Table headers={["Invoice #", "Amount", "Billing Date", "Due Date", "Period", "Status", ""]} empty={invoices.length === 0}>
        {invoices.map((inv) => (
          <tr key={inv.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-blue-700">
              <Link href={`/billing/invoices?search=${inv.invoice_number}`}>{inv.invoice_number}</Link>
            </td>
            <td className="px-4 py-3">{formatMoney(inv.amount)}</td>
            <td className="px-4 py-3">{formatDate(inv.billing_date)}</td>
            <td className="px-4 py-3">{formatDate(inv.due_date)}</td>
            <td className="px-4 py-3 text-xs">{formatDate(inv.period_start)} → {formatDate(inv.period_end)}</td>
            <td className="px-4 py-3"><Badge value={inv.status} /></td>
            <td className="px-4 py-3 text-right">
              <Link href={`/billing/invoices/${inv.id}/print`}>
                <Button variant="secondary">Print</Button>
              </Link>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
