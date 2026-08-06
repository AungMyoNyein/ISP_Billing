"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { humanize } from "@/lib/format";
import { Button, ErrorNote, Field, inputCls } from "@/components/ui";
import { CustomerPicker } from "@/components/CustomerPicker";
import type { Customer, SupportTicket, TicketOptions } from "@/lib/types";

/**
 * Opens a new ticket, or edits an existing one.
 *
 * `customer` fixes the account when the form is reached from a customer's own
 * Tickets tab — the operator is already looking at the right record, and asking
 * them to search for it again is how tickets end up on the wrong account.
 */
export function TicketForm({ ticket, customer, options, onSaved }: {
  ticket?: SupportTicket;
  customer?: Customer;
  options?: TicketOptions;
  onSaved: (ticket: SupportTicket) => void;
}) {
  const [opts, setOpts] = useState<TicketOptions | null>(options ?? null);
  const [picked, setPicked] = useState<Customer | null>(customer ?? ticket?.customer ?? null);
  const [subject, setSubject] = useState(ticket?.subject ?? "");
  const [description, setDescription] = useState(ticket?.description ?? "");
  const [category, setCategory] = useState(ticket?.category ?? "connectivity");
  const [priority, setPriority] = useState<string>(ticket?.priority ?? "normal");
  const [assignedTo, setAssignedTo] = useState<string>(ticket?.assigned_to ? String(ticket.assigned_to) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (opts) return;
    api<TicketOptions>("/tickets/filter-options").then(setOpts).catch(() => {});
  }, [opts]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) {
      setError("Choose the customer this ticket is for.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        customer_id: picked.id,
        subject,
        description,
        category,
        priority,
        assigned_to: assignedTo ? Number(assignedTo) : null,
      };
      const saved = ticket
        ? await api<SupportTicket>(`/tickets/${ticket.id}`, { method: "PUT", body })
        : await api<SupportTicket>("/tickets", { method: "POST", body });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorNote message={error} />

      <Field label="Customer *">
        <CustomerPicker value={picked} onChange={setPicked} disabled={!!customer} />
      </Field>

      <Field label="Subject *">
        <input
          className={inputCls}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short summary of what the customer reported"
          maxLength={200}
          required
        />
      </Field>

      <Field label="What did the customer report? *">
        <textarea
          className={`${inputCls} h-28 py-2`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Symptoms, when it started, what the customer has already tried…"
          maxLength={5000}
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Category">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {(opts?.categories ?? [category]).map((c) => (
              <option key={c} value={c} className="capitalize">{humanize(c)}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {(opts?.priorities ?? [priority]).map((p) => (
              <option key={p} value={p} className="capitalize">{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Assign to">
          <select className={inputCls} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Unassigned</option>
            {(opts?.agents ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : ticket ? "Save Changes" : "Open Ticket"}
        </Button>
      </div>
    </form>
  );
}
