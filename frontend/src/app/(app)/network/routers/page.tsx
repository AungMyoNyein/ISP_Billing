"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { usePaginated } from "@/hooks/usePaginated";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, Pagination, Table, inputCls } from "@/components/ui";
import type { Router } from "@/lib/types";

export default function RoutersPage() {
  const { data, page, lastPage, total, loading, error, setPage, reload } = usePaginated<Router>("/routers");
  const [editing, setEditing] = useState<Router | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<number | null>(null);

  async function check(router: Router) {
    setCheckingId(router.id);
    setActionError(null);
    try {
      await api(`/routers/${router.id}/check`);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setCheckingId(null);
    }
  }

  async function remove(router: Router) {
    if (!confirm(`Delete router "${router.name}"?`)) return;
    try {
      await api(`/routers/${router.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="MikroTik Routers"
        subtitle="RouterOS API endpoints used for PPPoE session control"
        actions={<Button onClick={() => setCreating(true)}>+ Add Router</Button>}
      />
      <ErrorNote message={error ?? actionError} />

      <Card>
        <Table
          headers={["Name", "Host", "API Port", "NAS IP", "Customers", "Status", "Last Seen", ""]}
          loading={loading}
          empty={data.length === 0}
        >
          {data.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{r.host}</td>
              <td className="px-4 py-3">{r.api_port}</td>
              <td className="px-4 py-3 font-mono text-xs">{r.nas_ip ?? "—"}</td>
              <td className="px-4 py-3">{r.customers_count ?? 0}</td>
              <td className="px-4 py-3"><Badge value={r.status} /></td>
              <td className="px-4 py-3">{formatDateTime(r.last_seen_at)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <Button variant="ghost" disabled={checkingId === r.id} onClick={() => check(r)}>
                  {checkingId === r.id ? "Checking…" : "Check"}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                <Button variant="ghost" onClick={() => remove(r)}>Delete</Button>
              </td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>

      <Modal title={editing ? `Edit ${editing.name}` : "Add Router"} open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}>
        <RouterForm router={editing ?? undefined} onSaved={() => { setCreating(false); setEditing(null); reload(); }} />
      </Modal>
    </div>
  );
}

function RouterForm({ router, onSaved }: { router?: Router; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: router?.name ?? "",
    host: router?.host ?? "",
    api_port: router ? String(router.api_port) : "8728",
    username: router?.username ?? "",
    password: "",
    nas_ip: router?.nas_ip ?? "",
    radius_secret: "",
    notes: router?.notes ?? "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => fieldErrors[k]?.[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        ...form,
        api_port: Number(form.api_port),
        nas_ip: form.nas_ip || null,
        radius_secret: form.radius_secret || null,
      };
      if (router && !form.password) delete body.password;
      if (router) await api(`/routers/${router.id}`, { method: "PUT", body });
      else await api("/routers", { method: "POST", body });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) { setError(e.message); setFieldErrors(e.errors ?? {}); }
      else setError("Failed to save router");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <Field label="Name *" error={err("name")}>
        <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Host / IP *" error={err("host")}>
          <input className={inputCls} value={form.host} onChange={(e) => set("host", e.target.value)} required />
        </Field>
        <Field label="API Port" error={err("api_port")}>
          <input className={inputCls} type="number" value={form.api_port} onChange={(e) => set("api_port", e.target.value)} />
        </Field>
        <Field label="API Username *" error={err("username")}>
          <input className={inputCls} value={form.username} onChange={(e) => set("username", e.target.value)} required />
        </Field>
        <Field label={router ? "API Password (blank = keep)" : "API Password *"} error={err("password")}>
          <input className={inputCls} type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required={!router} />
        </Field>
        <Field label="NAS IP (as seen by RADIUS)" error={err("nas_ip")}>
          <input className={inputCls} value={form.nas_ip} onChange={(e) => set("nas_ip", e.target.value)} />
        </Field>
        <Field label={router ? "RADIUS Secret (blank = keep)" : "RADIUS Secret"} error={err("radius_secret")}>
          <input className={inputCls} type="password" value={form.radius_secret} onChange={(e) => set("radius_secret", e.target.value)} />
        </Field>
      </div>
      <Field label="Notes" error={err("notes")}>
        <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save Router"}</Button>
      </div>
    </form>
  );
}
