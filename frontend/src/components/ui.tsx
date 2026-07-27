"use client";

import { ReactNode } from "react";
import Link from "next/link";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

const badgeColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  paid: "bg-emerald-100 text-emerald-700",
  online: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  unpaid: "bg-amber-100 text-amber-700",
  unknown: "bg-slate-100 text-slate-600",
  suspended: "bg-rose-100 text-rose-700",
  offline: "bg-rose-100 text-rose-700",
  expired: "bg-orange-100 text-orange-700",
  disabled: "bg-slate-200 text-slate-600",
  cancelled: "bg-slate-200 text-slate-600",
  "ping ok": "bg-emerald-100 text-emerald-700",
  "CoA ok": "bg-emerald-100 text-emerald-700",
  "ping fail": "bg-rose-100 text-rose-700",
  "CoA fail": "bg-rose-100 text-rose-700",
};

export function Badge({ value }: { value: string }) {
  const color = badgeColors[value] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${color}`}>
      {value}
    </span>
  );
}

export function Button({
  children, onClick, type = "button", variant = "primary", disabled, className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

// width-free variant for inline filter bars — `w-auto` can't override the
// `w-full` in inputCls because Tailwind emits w-full later in the stylesheet
export const inputBaseCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

export const inputCls = `w-full ${inputBaseCls}`;

export function Modal({ title, open, onClose, children, wide }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-16" onClick={onClose}>
      <div
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Pagination({ page, lastPage, total, onPage }: {
  page: number; lastPage: number; total: number; onPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span>{total.toLocaleString()} record{total === 1 ? "" : "s"}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</Button>
        <span>Page {page} / {Math.max(lastPage, 1)}</span>
        <Button variant="secondary" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function Table({ headers, children, loading, empty }: {
  headers: string[]; children: ReactNode; loading?: boolean; empty?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {loading ? (
            <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
          ) : empty ? (
            <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-slate-400">No records found.</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pass `href` rather than wrapping the card in a <Link>: the link has to be
 * the thing that fills the grid cell, otherwise the card sits short inside a
 * stretched anchor and its bottom edge drifts out of line with its neighbours.
 * h-full + mt-auto keep every box in a row the same height whether or not it
 * has a hint, with the hints on a common baseline.
 */
export function StatCard({ label, value, accent, hint, href }: {
  label: string; value: ReactNode; accent?: string; hint?: string; href?: string;
}) {
  const card = (
    <Card className={`flex h-full flex-col p-5 ${href ? "transition hover:border-slate-300 hover:shadow" : ""}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1.5 text-3xl font-semibold ${accent ?? "text-slate-900"}`}>{value}</p>
      {hint && <p className="mt-auto pt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );

  return href ? <Link href={href} className="block h-full">{card}</Link> : card;
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>;
}

export function WarningNote({ message, onDismiss }: { message?: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 font-medium text-amber-700 hover:text-amber-900">Dismiss</button>
      )}
    </div>
  );
}
