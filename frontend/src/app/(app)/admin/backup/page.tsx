"use client";

import { useCallback, useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Button, Card, ErrorNote, PageHeader, Table } from "@/components/ui";

interface Backup { name: string; size_bytes: number; created_at: string }

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function BackupPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api<{ data: Backup[] }>("/backups")
      .then((r) => setBackups(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const b = await api<Backup>("/backups", { method: "POST" });
      setNotice(`Backup ${b.name} created.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  }

  async function restore(name: string) {
    if (!confirm(`Restore the database from "${name}"?\n\nThis OVERWRITES all current data and cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api("/backups/restore", { method: "POST", body: { name } });
      setNotice(`Database restored from ${name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (!confirm(`Delete backup "${name}"?`)) return;
    try {
      await api(`/backups/${name}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function download(name: string) {
    const res = await fetch(`${API_URL}/backups/${name}/download`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      setError("Download failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader title="Backup & Restore" subtitle="PostgreSQL dumps of the main billing database"
        actions={<Button onClick={create} disabled={busy}>{busy ? "Working…" : "Create Backup Now"}</Button>} />
      <ErrorNote message={error} />
      {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      <Card>
        <Table headers={["Backup File", "Size", "Created", ""]} loading={loading} empty={backups.length === 0}>
          {backups.map((b) => (
            <tr key={b.name} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs font-medium">{b.name}</td>
              <td className="px-4 py-3">{formatBytes(b.size_bytes)}</td>
              <td className="px-4 py-3">{formatDateTime(b.created_at)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <Button variant="ghost" onClick={() => download(b.name)}>Download</Button>
                <Button variant="ghost" onClick={() => restore(b.name)}>Restore</Button>
                <Button variant="ghost" onClick={() => remove(b.name)}>Delete</Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
