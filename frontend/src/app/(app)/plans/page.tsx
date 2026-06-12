"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { usePaginated } from "@/hooks/usePaginated";
import { formatMoney, speedLabel } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, Pagination, Table, inputCls } from "@/components/ui";
import type { ServicePlan } from "@/lib/types";

export default function PlansPage() {
  const [search, setSearch] = useState("");
  const { data, page, lastPage, total, loading, error, setPage, reload } = usePaginated<ServicePlan>("/plans", { search });
  const [editing, setEditing] = useState<ServicePlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function remove(plan: ServicePlan) {
    if (!confirm(`Delete plan "${plan.name}"?`)) return;
    try {
      await api(`/plans/${plan.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Service Plans"
        subtitle="Speed profiles pushed to FreeRADIUS / MikroTik"
        actions={<Button onClick={() => setCreating(true)}>+ New Plan</Button>}
      />
      <ErrorNote message={error ?? actionError} />

      <Card>
        <div className="border-b border-slate-200 p-4">
          <input className={`${inputCls} max-w-sm`} placeholder="Search plans…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Table
          headers={["Plan Name", "Price", "Download", "Upload", "Session Timeout", "Idle Timeout", "MikroTik Rate Limit", "Customers", "Status", ""]}
          loading={loading}
          empty={data.length === 0}
        >
          {data.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3">{formatMoney(p.price)}</td>
              <td className="px-4 py-3">{speedLabel(p.download_speed_kbps)}</td>
              <td className="px-4 py-3">{speedLabel(p.upload_speed_kbps)}</td>
              <td className="px-4 py-3">{p.session_timeout ? `${p.session_timeout}s` : "unlimited"}</td>
              <td className="px-4 py-3">{p.idle_timeout ? `${p.idle_timeout}s` : "—"}</td>
              <td className="px-4 py-3 font-mono text-xs">{p.mikrotik_rate_limit || "auto"}</td>
              <td className="px-4 py-3">{p.customers_count ?? 0}</td>
              <td className="px-4 py-3"><Badge value={p.is_active ? "active" : "disabled"} /></td>
              <td className="px-4 py-3 text-right">
                <Button variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                <Button variant="ghost" onClick={() => remove(p)}>Delete</Button>
              </td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>

      <Modal title={editing ? `Edit ${editing.name}` : "New Service Plan"} open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }} wide>
        <PlanForm
          plan={editing ?? undefined}
          onSaved={() => { setCreating(false); setEditing(null); reload(); }}
        />
      </Modal>
    </div>
  );
}

function PlanForm({ plan, onSaved }: { plan?: ServicePlan; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    price: plan ? String(plan.price) : "",
    download_mbps: plan ? String(plan.download_speed_kbps / 1024) : "",
    upload_mbps: plan ? String(plan.upload_speed_kbps / 1024) : "",
    session_timeout: plan?.session_timeout != null ? String(plan.session_timeout) : "0",
    idle_timeout: plan?.idle_timeout != null ? String(plan.idle_timeout) : "300",
    mikrotik_rate_limit: plan?.mikrotik_rate_limit ?? "",
    framed_pool: plan?.framed_pool ?? "",
    mikrotik_group: plan?.mikrotik_group ?? "",
    simultaneous_use: plan?.simultaneous_use != null ? String(plan.simultaneous_use) : "",
    acct_interim_interval: plan?.acct_interim_interval != null ? String(plan.acct_interim_interval) : "300",
    validity_days: plan ? String(plan.validity_days) : "30",
    radius_group: plan?.radius_group ?? "",
    is_active: plan?.is_active ?? true,
  });

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => fieldErrors[k]?.[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const { download_mbps, upload_mbps, ...rest } = form;
      const body = {
        ...rest,
        price: Number(form.price),
        download_speed_kbps: Math.round(Number(download_mbps) * 1024),
        upload_speed_kbps: Math.round(Number(upload_mbps) * 1024),
        session_timeout: form.session_timeout === "" ? null : Number(form.session_timeout),
        idle_timeout: form.idle_timeout === "" ? null : Number(form.idle_timeout),
        validity_days: Number(form.validity_days),
        mikrotik_rate_limit: form.mikrotik_rate_limit || null,
        framed_pool: form.framed_pool || null,
        mikrotik_group: form.mikrotik_group || null,
        simultaneous_use: form.simultaneous_use === "" ? null : Number(form.simultaneous_use),
        acct_interim_interval: form.acct_interim_interval === "" ? null : Number(form.acct_interim_interval),
        radius_group: form.radius_group || null,
      };
      if (plan) await api(`/plans/${plan.id}`, { method: "PUT", body });
      else await api("/plans", { method: "POST", body });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) { setError(e.message); setFieldErrors(e.errors ?? {}); }
      else setError("Failed to save plan");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ErrorNote message={error} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Plan Name *" error={err("name")}>
          <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Price *" error={err("price")}>
          <input className={inputCls} type="number" min="0" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} required />
        </Field>
        <Field label="Download Speed (Mbps) *" error={err("download_speed_kbps")}>
          <input className={inputCls} type="number" min="0.1" step="0.1" value={form.download_mbps} onChange={(e) => set("download_mbps", e.target.value)} required />
        </Field>
        <Field label="Upload Speed (Mbps) *" error={err("upload_speed_kbps")}>
          <input className={inputCls} type="number" min="0.1" step="0.1" value={form.upload_mbps} onChange={(e) => set("upload_mbps", e.target.value)} required />
        </Field>
        <Field label="Session Timeout (seconds, 0 = unlimited)" error={err("session_timeout")}>
          <input className={inputCls} type="number" min="0" value={form.session_timeout} onChange={(e) => set("session_timeout", e.target.value)} />
        </Field>
        <Field label="Idle Timeout (seconds)" error={err("idle_timeout")}>
          <input className={inputCls} type="number" min="0" value={form.idle_timeout} onChange={(e) => set("idle_timeout", e.target.value)} />
        </Field>
        <Field label="MikroTik Rate Limit (blank = auto from speeds)" error={err("mikrotik_rate_limit")}>
          <input className={inputCls} value={form.mikrotik_rate_limit} onChange={(e) => set("mikrotik_rate_limit", e.target.value)} placeholder="10M/10M" />
        </Field>
        <Field label="Framed-Pool (IP pool name on the NAS)" error={err("framed_pool")}>
          <input className={inputCls} value={form.framed_pool} onChange={(e) => set("framed_pool", e.target.value)} placeholder="pppoe-pool" />
        </Field>
        <Field label="Mikrotik-Group" error={err("mikrotik_group")}>
          <input className={inputCls} value={form.mikrotik_group} onChange={(e) => set("mikrotik_group", e.target.value)} />
        </Field>
        <Field label="Simultaneous-Use (max sessions, blank = no limit)" error={err("simultaneous_use")}>
          <input className={inputCls} type="number" min="1" value={form.simultaneous_use} onChange={(e) => set("simultaneous_use", e.target.value)} />
        </Field>
        <Field label="Acct-Interim-Interval (seconds)" error={err("acct_interim_interval")}>
          <input className={inputCls} type="number" min="30" value={form.acct_interim_interval} onChange={(e) => set("acct_interim_interval", e.target.value)} />
        </Field>
        <Field label="Validity (days)" error={err("validity_days")}>
          <input className={inputCls} type="number" min="1" value={form.validity_days} onChange={(e) => set("validity_days", e.target.value)} />
        </Field>
        <Field label="RADIUS Group" error={err("radius_group")}>
          <input className={inputCls} value={form.radius_group} onChange={(e) => set("radius_group", e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
          Plan is active
        </label>
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save Plan"}</Button>
      </div>
    </form>
  );
}
