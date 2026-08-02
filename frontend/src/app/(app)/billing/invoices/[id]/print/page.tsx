"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, Button, ErrorNote } from "@/components/ui";
import type { Invoice, InvoicePrintData } from "@/lib/types";

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<InvoicePrintData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<InvoicePrintData>(`/invoices/${id}/print`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <p className="text-sm text-slate-400">Loading invoice…</p>;

  const { invoice, company } = data;
  const customer = invoice.customer;
  const currency = company.currency ?? "MMK";
  const money = (v: string | number) => formatMoney(v, currency);

  return (
    <div className="mx-auto max-w-3xl">
      {/* toolbar is screen-only; window.print() is what produces the paper copy */}
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Button variant="secondary" onClick={() => router.back()}>← Back</Button>
        <Button onClick={() => window.print()}>Print invoice</Button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 text-slate-800 print:rounded-none print:border-0 print:p-0 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6 sm:gap-6">
          {/* min-w-0 lets this column shrink below its content width — without
              it a long ISP address pushed the page past a 375px screen — and it
              stacks under the logo on a phone, where side by side leaves the
              text column narrow enough to break an email address mid-word */}
          <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:gap-4">
            {company.logo && (
              // stored as a data URI so it prints without a network fetch
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo} alt="" className="max-h-16 max-w-[8rem] object-contain" />
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">{company.name || "—"}</h1>
              <div className="mt-1 space-y-0.5 break-words text-sm text-slate-600">
                {company.address && <p className="whitespace-pre-line">Address: {company.address}</p>}
                {company.phone && <p>Phone: {company.phone}</p>}
                {company.email && <p>Email: {company.email}</p>}
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">INVOICE</p>
            <p className="mt-1 font-mono text-sm text-slate-600">{invoice.invoice_number}</p>
            <div className="mt-3 space-y-0.5 text-sm">
              <p><span className="text-slate-500">Invoice Date: </span>{formatDate(invoice.billing_date)}</p>
              <p><span className="text-slate-500">Due Date: </span>{formatDate(invoice.due_date)}</p>
            </div>
            <div className="mt-2 flex justify-start sm:justify-end"><Badge value={invoice.status} /></div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-8 border-b border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Bill To</h2>
            <p className="font-bold text-slate-900">{customer?.name ?? "—"}</p>
            <dl className="mt-1 space-y-0.5 text-sm text-slate-600">
              <Line label="Customer ID" value={customer?.customer_code} />
              <Line label="Phone" value={customer?.phone} />
              <Line label="Address" value={customer?.address} />
            </dl>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Service</h2>
            <dl className="space-y-0.5 text-sm text-slate-600">
              <Line label="Service Plan" value={invoice.service_plan?.name ?? customer?.service_plan?.name} />
              <Line label="Expire Date" value={customer?.expiry_date ? formatDate(customer.expiry_date) : null} />
              {invoice.period_start && invoice.period_end && (
                <Line label="Period" value={`${formatDate(invoice.period_start)} — ${formatDate(invoice.period_end)}`} />
              )}
            </dl>
          </div>
        </section>

        <table className="w-full py-6 text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="py-2.5 pr-3 font-bold">Description</th>
              <th className="px-3 py-2.5 text-center font-bold">Month</th>
              <th className="py-2.5 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-3 pr-3">
                {invoice.service_plan?.name ?? "Internet service"}
                {invoice.period_start && invoice.period_end && (
                  <span className="block text-xs text-slate-500">
                    {formatDate(invoice.period_start)} — {formatDate(invoice.period_end)}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-center tabular-nums">{billedMonthsLabel(invoice)}</td>
              <td className="whitespace-nowrap py-3 text-right tabular-nums">{money(invoice.amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="py-3 pr-3 text-right font-bold" colSpan={2}>Total</td>
              <td className="whitespace-nowrap py-3 text-right text-lg font-bold tabular-nums text-slate-900">{money(invoice.amount)}</td>
            </tr>
          </tfoot>
        </table>

        {invoice.notes && (
          <p className="border-t border-slate-200 pt-4 text-sm text-slate-600">{invoice.notes}</p>
        )}

        {/* the letterhead already carries the address; the footer is the
            slogan, and drops out entirely when none is set */}
        {company.slogan && (
          <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-sm text-slate-500">
            {company.slogan}
          </footer>
        )}
      </div>
    </div>
  );
}

/**
 * How many months the line item covers, e.g. "1 Month" / "2 Month".
 * Singular "Month" is intentional at every count — it is how the ISP writes
 * it on their invoices.
 *
 * Taken from the billed period rather than the plan, because a renewal can
 * cover several plan cycles at once; the period is inclusive of both end
 * dates, hence the +1 day. Plan validity_days is the fallback for older
 * invoices saved without a period.
 */
function billedMonthsLabel(invoice: Invoice): string {
  let days: number | null = null;

  if (invoice.period_start && invoice.period_end) {
    const ms = new Date(invoice.period_end).getTime() - new Date(invoice.period_start).getTime();
    days = ms / 86_400_000 + 1;
  } else if (invoice.service_plan?.validity_days) {
    days = invoice.service_plan.validity_days;
  }

  if (days === null || !Number.isFinite(days)) return "—";

  return `${Math.max(1, Math.round(days / 30))} Month`;
}

/**
 * Label and value sit side by side on one line. The label column is a fixed
 * width rather than auto, so the values down a block line up with each other
 * instead of each starting at a different indent.
 */
function Line({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-baseline gap-x-2">
      <dt className="whitespace-nowrap text-slate-500">{label}:</dt>
      <dd className="whitespace-pre-line break-words">{value || "—"}</dd>
    </div>
  );
}
