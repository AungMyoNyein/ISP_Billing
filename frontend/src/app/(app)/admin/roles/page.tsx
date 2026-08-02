"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, Table, inputCls } from "@/components/ui";
import type { Role } from "@/lib/types";

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api<{ data: Role[]; available_permissions: string[] }>("/roles")
      .then((r) => { setRoles(r.data); setAvailable(r.available_permissions); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function remove(role: Role) {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      await api(`/roles/${role.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader title="Roles & Permissions" subtitle="Control what each staff role can access"
        actions={<Button onClick={() => setCreating(true)}>+ New Role</Button>} />
      <ErrorNote message={error} />

      <Card>
        <Table headers={["Role", "Description", "Permissions", "Users", ""]} loading={loading} empty={roles.length === 0}>
          {roles.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">
                {r.name} {r.is_system && <Badge value="system" />}
              </td>
              <td className="px-4 py-3 text-slate-500">{r.description ?? "—"}</td>
              <td className="px-4 py-3">
                <div className="flex max-w-md flex-wrap gap-1">
                  {r.permissions.includes("*")
                    ? <Badge value="all permissions" />
                    : r.permissions.map((p) => (
                      <span key={p} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{p}</span>
                    ))}
                </div>
              </td>
              <td className="px-4 py-3">{r.users_count ?? 0}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <Button variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                {!r.is_system && <Button variant="ghost" onClick={() => remove(r)}>Delete</Button>}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal title={editing ? `Edit ${editing.name}` : "New Role"} open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}>
        <RoleForm role={editing ?? undefined} available={available}
          onSaved={() => { setCreating(false); setEditing(null); load(); }} />
      </Modal>
    </div>
  );
}

function RoleForm({ role, available, onSaved }: { role?: Role; available: string[]; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const all = permissions.includes("*");

  function toggle(perm: string) {
    setPermissions((p) => (p.includes(perm) ? p.filter((x) => x !== perm) : [...p, perm]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { name, description: description || null, permissions };
      if (role) await api(`/roles/${role.id}`, { method: "PUT", body });
      else await api("/roles", { method: "POST", body });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save role");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />
      <Field label="Role Name *">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required disabled={role?.is_system} />
      </Field>
      <Field label="Description">
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Permissions</p>
        <label className="mb-2 flex items-center gap-2 py-1.5 text-sm font-medium text-slate-800">
          <input type="checkbox" className="h-4 w-4 shrink-0" checked={all} onChange={() => setPermissions(all ? [] : ["*"])} />
          All permissions (*)
        </label>
        {!all && (
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {available.map((p) => (
              <label key={p} className="flex items-center gap-2 py-1.5 text-sm text-slate-600">
                <input type="checkbox" className="h-4 w-4 shrink-0" checked={permissions.includes(p)} onChange={() => toggle(p)} />
                {p}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save Role"}</Button>
      </div>
    </form>
  );
}
