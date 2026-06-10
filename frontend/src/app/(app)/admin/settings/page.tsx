"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, ErrorNote, Field, PageHeader, inputCls } from "@/components/ui";

interface SettingRow { id: number; key: string; value: unknown; group: string }

const KNOWN: Array<{ key: string; label: string; group: string; type: "text" | "number" | "boolean" }> = [
  { key: "company.name", label: "Company Name", group: "company", type: "text" },
  { key: "company.currency", label: "Currency", group: "company", type: "text" },
  { key: "billing.due_days", label: "Invoice Due Days", group: "billing", type: "number" },
  { key: "billing.auto_suspend", label: "Auto-suspend overdue customers", group: "billing", type: "boolean" },
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Record<string, SettingRow[]>>("/settings")
      .then((groups) => {
        const flat: Record<string, unknown> = {};
        Object.values(groups).flat().forEach((s) => { flat[s.key] = s.value; });
        setValues(flat);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api("/settings", {
        method: "PUT",
        body: {
          settings: KNOWN.map((k) => ({ key: k.key, value: values[k.key] ?? null, group: k.group })),
        },
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="System Settings" subtitle="Billing behaviour and company details" />
      <ErrorNote message={error} />
      {saved && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Settings saved.</div>}

      <Card className="space-y-4 p-6">
        {KNOWN.map((s) => (
          <Field key={s.key} label={s.label}>
            {s.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(values[s.key])}
                  onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.checked }))}
                />
                Enabled
              </label>
            ) : (
              <input
                className={inputCls}
                type={s.type}
                value={String(values[s.key] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [s.key]: s.type === "number" ? Number(e.target.value) : e.target.value }))}
              />
            )}
          </Field>
        ))}
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Settings"}</Button>
        </div>
      </Card>
    </div>
  );
}
