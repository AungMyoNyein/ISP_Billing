"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { usePaginated } from "@/hooks/usePaginated";
import { Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, Pagination, Table, inputCls } from "@/components/ui";
import type { Router } from "@/lib/types";

type CheckResult = { ping: boolean; coa: boolean; online_sessions: number };

export default function RoutersPage() {
  const { data, page, lastPage, total, loading, error, setPage, reload } = usePaginated<Router>("/routers");
  const [editing, setEditing] = useState<Router | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [checks, setChecks] = useState<Record<number, CheckResult>>({});

  async function check(router: Router) {
    setCheckingId(router.id);
    setActionError(null);
    try {
      const result = await api<CheckResult>(`/routers/${router.id}/check`);
      setChecks((c) => ({ ...c, [router.id]: result }));
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
        title="NAS Routers"
        subtitle="PPPoE concentrators registered as FreeRADIUS NAS clients"
        actions={<Button onClick={() => setCreating(true)}>+ Add Router</Button>}
      />
      <ErrorNote message={error ?? actionError} />

      <Card>
        <Table
          headers={["Name", "NAS IP", "CoA Port", "Customers", "Check Result", ""]}
          loading={loading}
          empty={data.length === 0}
        >
          {data.map((r) => {
            const c = checks[r.id];
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.nas_ip}</td>
                <td className="px-4 py-3">{r.coa_port}</td>
                <td className="px-4 py-3">{r.customers_count ?? 0}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {c ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge value={c.ping ? "ping ok" : "ping fail"} />
                      <Badge value={c.coa ? "CoA ok" : "CoA fail"} />
                      <span className="text-xs text-slate-500">{c.online_sessions} online</span>
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="ghost" disabled={checkingId === r.id} onClick={() => check(r)}>
                    {checkingId === r.id ? "Checking…" : "Check"}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                  <Button variant="ghost" onClick={() => remove(r)}>Delete</Button>
                </td>
              </tr>
            );
          })}
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
    nas_ip: router?.nas_ip ?? "",
    coa_port: router ? String(router.coa_port) : "3799",
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
        coa_port: Number(form.coa_port),
      };
      if (router && !form.radius_secret) delete body.radius_secret;
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
        <Field label="NAS IP (as seen by RADIUS) *" error={err("nas_ip")}>
          <input className={inputCls} value={form.nas_ip} onChange={(e) => set("nas_ip", e.target.value)} required />
        </Field>
        <Field label="CoA / Disconnect Port" error={err("coa_port")}>
          <input className={inputCls} type="number" value={form.coa_port} onChange={(e) => set("coa_port", e.target.value)} />
        </Field>
      </div>
      <Field label={router ? "RADIUS Secret (blank = keep)" : "RADIUS Secret *"} error={err("radius_secret")}>
        <input className={inputCls} type="password" value={form.radius_secret} onChange={(e) => set("radius_secret", e.target.value)} required={!router} />
      </Field>
      <Field label="Notes" error={err("notes")}>
        <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save Router"}</Button>
      </div>
    </form>
  );
}
