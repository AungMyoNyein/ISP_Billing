"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { usePaginated } from "@/hooks/usePaginated";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, Pagination, Table, inputCls } from "@/components/ui";
import type { Role, User } from "@/lib/types";

export default function UsersPage() {
  const { data, page, lastPage, total, loading, error, setPage, reload } = usePaginated<User>("/users");
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: Role[] }>("/roles").then((r) => setRoles(r.data)).catch(() => {});
  }, []);

  async function remove(user: User) {
    if (!confirm(`Delete user "${user.email}"?`)) return;
    try {
      await api(`/users/${user.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="Staff accounts for this system"
        actions={<Button onClick={() => setCreating(true)}>+ New User</Button>} />
      <ErrorNote message={error ?? actionError} />

      <Card>
        <Table headers={["Name", "Email", "Role", "Status", "Last Login", ""]} loading={loading} empty={data.length === 0}>
          {data.map((u) => (
            <tr key={u.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{u.name}</td>
              <td className="px-4 py-3">{u.email}</td>
              <td className="px-4 py-3">{u.role?.name ?? "—"}</td>
              <td className="px-4 py-3"><Badge value={u.is_active ? "active" : "disabled"} /></td>
              <td className="px-4 py-3">{formatDateTime(u.last_login_at)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <Button variant="ghost" onClick={() => setEditing(u)}>Edit</Button>
                <Button variant="ghost" onClick={() => remove(u)}>Delete</Button>
              </td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} lastPage={lastPage} total={total} onPage={setPage} />
      </Card>

      <Modal title={editing ? `Edit ${editing.name}` : "New User"} open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}>
        <UserForm user={editing ?? undefined} roles={roles} onSaved={() => { setCreating(false); setEditing(null); reload(); }} />
      </Modal>
    </div>
  );
}

function UserForm({ user, roles, onSaved }: { user?: User; roles: Role[]; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    password: "",
    role_id: user?.role_id ? String(user.role_id) : "",
    is_active: user?.is_active ?? true,
  });

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => fieldErrors[k]?.[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...form, role_id: Number(form.role_id) };
      if (user && !form.password) delete body.password;
      if (user) await api(`/users/${user.id}`, { method: "PUT", body });
      else await api("/users", { method: "POST", body });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) { setError(e.message); setFieldErrors(e.errors ?? {}); }
      else setError("Failed to save user");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <Field label="Name *" error={err("name")}>
        <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} required />
      </Field>
      <Field label="Email *" error={err("email")}>
        <input className={inputCls} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
      </Field>
      <Field label={user ? "Password (blank = keep)" : "Password *"} error={err("password")}>
        <input className={inputCls} type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required={!user} minLength={8} />
      </Field>
      <Field label="Role *" error={err("role_id")}>
        <select className={inputCls} value={form.role_id} onChange={(e) => set("role_id", e.target.value)} required>
          <option value="">— select —</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
      <label className="flex items-center gap-2 py-1.5 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 shrink-0" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
        Account is active
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save User"}</Button>
      </div>
    </form>
  );
}
