"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button, ErrorNote, Field, inputCls } from "@/components/ui";
import type { Customer, Router, ServicePlan } from "@/lib/types";
import { DateInput } from "@/components/DateInput";

const STATUSES = ["pending", "active", "suspended", "expired", "disabled"];

export function CustomerForm({ customer, onSaved }: { customer?: Customer; onSaved: (c: Customer) => void }) {
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    customer_code: customer?.customer_code ?? "",
    username: customer?.username ?? "",
    radius_password: customer?.radius_password ?? "",
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    dn_zone: customer?.dn_zone ?? "",
    sn_odb: customer?.sn_odb ?? "",
    gps_location: customer?.gps_location ?? "",
    status: customer?.status ?? "pending",
    notes: customer?.notes ?? "",
    service_plan_id: customer?.service_plan_id ? String(customer.service_plan_id) : "",
    router_id: customer?.router_id ? String(customer.router_id) : "",
    smartolt_onu_sn: customer?.smartolt_onu_sn ?? "",
    framed_ip_address: customer?.framed_ip_address ?? "",
    expiry_date: customer?.expiry_date?.slice(0, 10) ?? "",
  });

  useEffect(() => {
    api<{ data: ServicePlan[] }>("/plans", { params: { per_page: 100 } }).then((r) => setPlans(r.data)).catch(() => {});
    api<{ data: Router[] }>("/routers", { params: { per_page: 100 } }).then((r) => setRouters(r.data)).catch(() => {});
  }, []);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const body: Record<string, unknown> = {
        ...form,
        service_plan_id: form.service_plan_id || null,
        router_id: form.router_id || null,
        framed_ip_address: form.framed_ip_address || null,
        expiry_date: form.expiry_date || null,
      };
      if (customer && !form.radius_password) delete body.radius_password;

      const saved = customer
        ? await api<Customer>(`/customers/${customer.id}`, { method: "PUT", body })
        : await api<Customer>("/customers", { method: "POST", body });
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors ?? {});
      } else {
        setError("Failed to save customer");
      }
      setBusy(false);
    }
  }

  const err = (k: string) => fieldErrors[k]?.[0];

  return (
    <form onSubmit={submit}>
      <ErrorNote message={error} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Customer ID *" error={err("customer_code")}>
          <input className={inputCls} value={form.customer_code} onChange={(e) => set("customer_code", e.target.value)} placeholder="CUST-0001" required />
        </Field>
        <Field label="Full Name *" error={err("name")}>
          <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Username (PPPoE) *" error={err("username")}>
          <input className={inputCls} value={form.username} onChange={(e) => set("username", e.target.value)} required />
        </Field>
        <Field label={customer ? "Password (leave blank to keep)" : "Password *"} error={err("radius_password")}>
          <input className={inputCls} value={form.radius_password} onChange={(e) => set("radius_password", e.target.value)} required={!customer} />
        </Field>
        <Field label="Phone" error={err("phone")}>
          <input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Status" error={err("status")}>
          <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Address" error={err("address")}>
            <input className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
        </div>
        <Field label="DN Zone" error={err("dn_zone")}>
          <input className={inputCls} value={form.dn_zone} onChange={(e) => set("dn_zone", e.target.value)} placeholder="YGN-North" />
        </Field>
        <Field label="SN ODB" error={err("sn_odb")}>
          <input className={inputCls} value={form.sn_odb} onChange={(e) => set("sn_odb", e.target.value)} placeholder="ODB-A-01" />
        </Field>
        <Field label="GPS Location" error={err("gps_location")}>
          <input className={inputCls} value={form.gps_location} onChange={(e) => set("gps_location", e.target.value)} placeholder="16.8409,96.1735" />
        </Field>
        <Field label="SmartOLT ONU Serial" error={err("smartolt_onu_sn")}>
          <input className={inputCls} value={form.smartolt_onu_sn} onChange={(e) => set("smartolt_onu_sn", e.target.value)} />
        </Field>
        <Field label="Static IP (Framed-IP-Address, blank = from pool)" error={err("framed_ip_address")}>
          <input className={inputCls} value={form.framed_ip_address} onChange={(e) => set("framed_ip_address", e.target.value)} placeholder="100.64.10.55" />
        </Field>
        <Field label="Service Plan" error={err("service_plan_id")}>
          <select className={inputCls} value={form.service_plan_id} onChange={(e) => set("service_plan_id", e.target.value)}>
            <option value="">— none —</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Router" error={err("router_id")}>
          <select className={inputCls} value={form.router_id} onChange={(e) => set("router_id", e.target.value)}>
            <option value="">— none —</option>
            {routers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Expiry Date" error={err("expiry_date")}>
          <DateInput value={form.expiry_date} onChange={(v) => set("expiry_date", v)} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notes" error={err("notes")}>
            <textarea className={inputCls} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : customer ? "Save Changes" : "Create Customer"}</Button>
      </div>
    </form>
  );
}
