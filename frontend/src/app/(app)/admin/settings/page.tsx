"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, ErrorNote, Field, PageHeader, inputCls } from "@/components/ui";

interface SettingRow { id: number; key: string; value: unknown; group: string }

type FieldType = "text" | "textarea" | "number" | "boolean";

const KNOWN: Array<{ key: string; label: string; group: string; type: FieldType; hint?: string }> = [
  { key: "company.name", label: "ISP Name", group: "company", type: "text", hint: "Printed as the invoice letterhead" },
  { key: "company.address", label: "ISP Address", group: "company", type: "textarea", hint: "Appears under the ISP name on invoices" },
  { key: "company.phone", label: "ISP Phone", group: "company", type: "text" },
  { key: "company.email", label: "ISP Email", group: "company", type: "text" },
  { key: "company.slogan", label: "ISP Slogan", group: "company", type: "text", hint: "Printed in the invoice footer" },
  { key: "company.currency", label: "Currency", group: "company", type: "text" },
  { key: "billing.due_days", label: "Invoice Due Days", group: "billing", type: "number" },
  { key: "billing.auto_suspend", label: "Auto-suspend overdue customers", group: "billing", type: "boolean" },
];

// keep well under the API's 512 KB cap once base64 inflates the file by ~4/3
const MAX_LOGO_BYTES = 350 * 1024;

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [logo, setLogo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Record<string, SettingRow[]>>("/settings")
      .then((groups) => {
        const flat: Record<string, unknown> = {};
        Object.values(groups).flat().forEach((s) => { flat[s.key] = s.value; });
        setValues(flat);
        setLogo(typeof flat["company.logo"] === "string" ? (flat["company.logo"] as string) : null);
      })
      .catch((e) => setError(e.message));
  }, []);

  function pickLogo(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("The logo must be an image file.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(`That image is ${Math.round(file.size / 1024)} KB — use one under ${MAX_LOGO_BYTES / 1024} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api("/settings", {
        method: "PUT",
        body: {
          settings: [
            ...KNOWN.map((k) => ({ key: k.key, value: values[k.key] ?? null, group: k.group })),
            { key: "company.logo", value: logo, group: "company" },
          ],
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
      <PageHeader title="System Settings" subtitle="Billing behaviour and the ISP details printed on invoices" />
      <ErrorNote message={error} />
      {saved && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">Settings saved.</div>}

      <Card className="space-y-4 p-6">
        <Field label="ISP Logo">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
              {logo ? (
                // a data URI, so next/image would add no benefit and needs config
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="ISP logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-slate-400">No logo</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickLogo(f);
                  e.target.value = "";
                }}
              />
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                {logo ? "Replace logo" : "Upload logo"}
              </Button>
              {logo && (
                <Button variant="ghost" onClick={() => setLogo(null)}>Remove</Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">PNG, JPEG, GIF, WebP or SVG, under 350 KB. Shown on printed invoices.</p>
        </Field>

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
            ) : s.type === "textarea" ? (
              <textarea
                className={`${inputCls} h-auto py-2`}
                rows={3}
                value={String(values[s.key] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
              />
            ) : (
              <input
                className={inputCls}
                type={s.type}
                value={String(values[s.key] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [s.key]: s.type === "number" ? Number(e.target.value) : e.target.value }))}
              />
            )}
            {s.hint && <span className="mt-1 block text-xs text-slate-400">{s.hint}</span>}
          </Field>
        ))}
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Settings"}</Button>
        </div>
      </Card>
    </div>
  );
}
