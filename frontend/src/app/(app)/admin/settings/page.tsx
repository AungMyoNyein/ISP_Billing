"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, ErrorNote, Field, PageHeader, inputCls } from "@/components/ui";

interface SettingRow { id: number; key: string; value: unknown; group: string }

type FieldType = "text" | "textarea" | "number" | "boolean" | "password" | "select";

interface SettingField {
  key: string;
  label: string;
  group: string;
  type: FieldType;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
}

const SECTIONS: Array<{ title: string; description?: string; fields: SettingField[] }> = [
  {
    title: "ISP Details",
    description: "Printed on invoices",
    fields: [
      { key: "company.name", label: "ISP Name", group: "company", type: "text", hint: "Printed as the invoice letterhead" },
      { key: "company.address", label: "ISP Address", group: "company", type: "textarea", hint: "Appears under the ISP name on invoices" },
      { key: "company.phone", label: "ISP Phone", group: "company", type: "text" },
      { key: "company.email", label: "ISP Email", group: "company", type: "text" },
      { key: "company.slogan", label: "ISP Slogan", group: "company", type: "text", hint: "Printed in the invoice footer" },
      { key: "company.currency", label: "Currency", group: "company", type: "text" },
    ],
  },
  {
    title: "Billing",
    fields: [
      { key: "billing.due_days", label: "Invoice Due Days", group: "billing", type: "number" },
      { key: "billing.auto_suspend", label: "Auto-suspend overdue customers", group: "billing", type: "boolean" },
    ],
  },
  {
    title: "Automatic Report Email",
    description: "A summary of signups, invoicing, revenue and customer status, sent on a schedule",
    fields: [
      { key: "reports.email.enabled", label: "Send reports automatically", group: "reports", type: "boolean" },
      {
        key: "reports.email.frequency", label: "Frequency", group: "reports", type: "select",
        hint: "Daily covers yesterday, weekly is sent Monday for the previous week, monthly on the 1st for the previous month",
        options: [
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
        ],
      },
      {
        key: "reports.email.recipients", label: "Recipients", group: "reports", type: "textarea",
        hint: "One or more email addresses, separated by commas",
      },
    ],
  },
  {
    title: "Outgoing Mail (SMTP)",
    description: "The account the reports are sent through. Without it, reports are written to the application log instead of being delivered.",
    fields: [
      { key: "mail.host", label: "SMTP Host", group: "mail", type: "text", hint: "e.g. smtp.gmail.com" },
      { key: "mail.port", label: "SMTP Port", group: "mail", type: "number", hint: "587 for TLS, 465 for SSL" },
      { key: "mail.username", label: "SMTP Username", group: "mail", type: "text" },
      { key: "mail.password", label: "SMTP Password", group: "mail", type: "password", hint: "Stored encrypted and never shown again once saved" },
      {
        key: "mail.encryption", label: "Encryption", group: "mail", type: "select",
        options: [
          { value: "tls", label: "TLS" },
          { value: "ssl", label: "SSL" },
          { value: "", label: "None" },
        ],
      },
      { key: "mail.from_address", label: "From Address", group: "mail", type: "text" },
      { key: "mail.from_name", label: "From Name", group: "mail", type: "text" },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

// keep well under the API's 512 KB cap once base64 inflates the file by ~4/3
const MAX_LOGO_BYTES = 350 * 1024;

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [logo, setLogo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
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
            ...ALL_FIELDS.map((k) => ({ key: k.key, value: values[k.key] ?? null, group: k.group })),
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

  async function sendTest() {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      // save first: testing against what is on screen rather than what was
      // last saved is the only behaviour that isn't confusing
      await save();
      const res = await api<{ message: string }>("/settings/test-email", {
        method: "POST",
        body: { to: testTo },
      });
      setTestResult(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test email failed");
    } finally {
      setTesting(false);
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

        {SECTIONS[0].fields.map((s) => (
          <SettingInput key={s.key} field={s} values={values} setValues={setValues} />
        ))}
      </Card>

      {SECTIONS.slice(1).map((section) => (
        <Card key={section.title} className="mt-4 space-y-4 p-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{section.title}</h2>
            {section.description && <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>}
          </div>

          {section.fields.map((s) => (
            <SettingInput key={s.key} field={s} values={values} setValues={setValues} />
          ))}

          {section.title === "Outgoing Mail (SMTP)" && (
            <div className="border-t border-slate-200 pt-4">
              <Field label="Send a test report">
                <div className="flex flex-wrap gap-2">
                  <input
                    className={`${inputCls} flex-1`}
                    type="email"
                    placeholder="you@example.com"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                  />
                  <Button variant="secondary" onClick={sendTest} disabled={testing || !testTo}>
                    {testing ? "Sending…" : "Send test"}
                  </Button>
                </div>
                <span className="mt-1 block text-xs text-slate-400">
                  Saves the settings above, then sends one report to that address straight away.
                </span>
              </Field>
              {testResult && (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
                  {testResult}
                </div>
              )}
            </div>
          )}
        </Card>
      ))}

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Settings"}</Button>
      </div>
    </div>
  );
}

function SettingInput({ field, values, setValues }: {
  field: SettingField;
  values: Record<string, unknown>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const set = (v: unknown) => setValues((prev) => ({ ...prev, [field.key]: v }));
  const current = values[field.key];

  return (
    <Field label={field.label}>
      {field.type === "boolean" ? (
        <label className="flex items-center gap-2 py-1.5 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 shrink-0" checked={Boolean(current)} onChange={(e) => set(e.target.checked)} />
          Enabled
        </label>
      ) : field.type === "textarea" ? (
        <textarea
          className={`${inputCls} h-auto py-2`}
          rows={3}
          value={String(current ?? "")}
          onChange={(e) => set(e.target.value)}
        />
      ) : field.type === "select" ? (
        <select className={inputCls} value={String(current ?? "")} onChange={(e) => set(e.target.value)}>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          className={inputCls}
          type={field.type === "password" ? "password" : field.type}
          // the API returns a mask for secrets; clear it on focus so typing
          // replaces the password rather than appending to eight asterisks
          value={String(current ?? "")}
          onFocus={() => { if (field.type === "password" && current === "********") set(""); }}
          onChange={(e) => set(field.type === "number" ? Number(e.target.value) : e.target.value)}
          autoComplete={field.type === "password" ? "new-password" : undefined}
        />
      )}
      {field.hint && <span className="mt-1 block text-xs text-slate-400">{field.hint}</span>}
    </Field>
  );
}
