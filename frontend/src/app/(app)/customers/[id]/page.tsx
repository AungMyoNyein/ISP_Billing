"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatBytes, formatDate, formatDateTime, formatDuration, formatMoney } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Modal, PageHeader, Table } from "@/components/ui";
import { CustomerForm } from "@/components/CustomerForm";
import type { Customer, Invoice } from "@/lib/types";

interface UsageDay { date: string; download_bytes: number; upload_bytes: number; sessions: number }
interface UsageSession {
  radacctid: number; acctstarttime: string | null; acctstoptime: string | null;
  acctsessiontime: number | null; acctinputoctets: number | null; acctoutputoctets: number | null;
  framedipaddress: string; callingstationid: string; nasipaddress: string;
}
interface Usage { daily: UsageDay[]; sessions: UsageSession[]; online: boolean }

const TABS = ["Overview", "Bandwidth Usage", "Invoices"] as const;

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Customer>(`/customers/${id}`).then(setCustomer).catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (tab === "Bandwidth Usage" && !usage) {
      api<Usage>(`/customers/${id}/usage`, { params: { days: 30 } }).then(setUsage).catch((e) => setError(e.message));
    }
    if (tab === "Invoices" && invoices.length === 0) {
      api<{ data: Invoice[] }>("/invoices", { params: { customer_id: id, per_page: 50 } })
        .then((r) => setInvoices(r.data)).catch((e) => setError(e.message));
    }
  }, [tab, id, usage, invoices.length]);

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

  async function renew() {
    if (!confirm("Generate a renewal invoice for this customer?")) return;
    setBusy(true);
    try {
      await api(`/billing/renew/${id}`, { method: "POST" });
      setInvoices([]);
      setTab("Invoices");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Renewal failed");
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
            <Button variant="secondary" onClick={renew} disabled={busy}>Renew</Button>
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
      {tab === "Bandwidth Usage" && <UsageTab usage={usage} />}
      {tab === "Invoices" && <InvoicesTab invoices={invoices} />}

      <Modal title="Edit Customer" open={editOpen} onClose={() => setEditOpen(false)} wide>
        <CustomerForm
          customer={customer}
          onSaved={() => { setEditOpen(false); load(); }}
        />
      </Modal>
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2 text-sm">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Notes</h3>
        <p className="whitespace-pre-wrap text-sm text-slate-600">{customer.notes || "No notes."}</p>
      </Card>
    </div>
  );
}

function UsageTab({ usage }: { usage: Usage | null }) {
  if (!usage) return <div className="py-16 text-center text-slate-400">Loading usage from RADIUS accounting…</div>;

  const totalDown = usage.daily.reduce((s, d) => s + d.download_bytes, 0);
  const totalUp = usage.daily.reduce((s, d) => s + d.upload_bytes, 0);
  const max = Math.max(...usage.daily.map((d) => d.download_bytes + d.upload_bytes), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <p className="text-xs text-slate-500">Download (30 days)</p>
          <p className="text-xl font-semibold text-blue-600">{formatBytes(totalDown)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-slate-500">Upload (30 days)</p>
          <p className="text-xl font-semibold text-emerald-600">{formatBytes(totalUp)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-slate-500">Currently</p>
          <p className="text-xl font-semibold">{usage.online ? <span className="text-emerald-600">Online</span> : <span className="text-slate-400">Offline</span>}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Daily usage — last 30 days</h3>
        {usage.daily.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No accounting data.</p>
        ) : (
          <div className="flex h-48 items-end gap-1">
            {usage.daily.map((d) => (
              <div
                key={d.date}
                className="group relative flex flex-1 flex-col justify-end"
                title={`${d.date}\n↓ ${formatBytes(d.download_bytes)}  ↑ ${formatBytes(d.upload_bytes)}`}
              >
                <div className="w-full rounded-t bg-emerald-400" style={{ height: `${(d.upload_bytes / max) * 100}%` }} />
                <div className="w-full bg-blue-500" style={{ height: `${(d.download_bytes / max) * 100}%` }} />
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-4 text-xs text-slate-500">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />Download</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" />Upload</span>
        </div>
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
    </div>
  );
}

function InvoicesTab({ invoices }: { invoices: Invoice[] }) {
  return (
    <Card>
      <Table headers={["Invoice #", "Amount", "Billing Date", "Due Date", "Period", "Status"]} empty={invoices.length === 0}>
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
          </tr>
        ))}
      </Table>
    </Card>
  );
}
