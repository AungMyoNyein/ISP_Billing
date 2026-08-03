"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, ErrorNote, Field, Modal, inputCls } from "@/components/ui";

/**
 * Renewal confirmation with an optional hand-picked expiry date.
 *
 * Left blank, the customer's service plan decides the period exactly as it
 * always has — the date is an override for the cases a plan cannot express
 * (a part month, an agreed date, a goodwill extension), not a new required
 * step. The field stays empty on open so the default path is still one click.
 */
export function RenewDialog({ open, customerId, customerName, planName, validityDays, onClose, onDone }: {
  open: boolean;
  customerId: number | null;
  customerName?: string;
  planName?: string | null;
  validityDays?: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopening for a different customer must not inherit the last date typed.
  useEffect(() => {
    if (open) {
      setExpiry("");
      setError(null);
    }
  }, [open, customerId]);

  async function submit() {
    if (customerId === null) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/billing/renew/${customerId}`, {
        method: "POST",
        body: expiry ? { expiry_date: expiry } : {},
      });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Renewal failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Generate renewal invoice" open={open} onClose={onClose}>
      <ErrorNote message={error} />

      <p className="mb-4 text-sm text-slate-600">
        {customerName ? <><span className="font-medium text-slate-900">{customerName}</span> — </> : null}
        {planName ?? "no plan"}
        {validityDays ? ` · ${validityDays} days` : ""}
      </p>

      <Field label="New expiry date (optional)">
        <input
          type="date"
          className={inputCls}
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
        />
      </Field>
      <p className="mt-1.5 text-xs text-slate-500">
        {expiry
          ? "This date becomes the customer's expiry once the invoice is paid."
          : validityDays
            ? `Leave blank to use the plan's ${validityDays}-day validity.`
            : "Leave blank to use the plan's validity."}
      </p>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? "Generating…" : "Generate invoice"}
        </Button>
      </div>
    </Modal>
  );
}
