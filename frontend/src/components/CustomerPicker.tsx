"use client";

import { useEffect, useRef, useState } from "react";
import { api, Paginated } from "@/lib/api";
import { inputCls } from "@/components/ui";
import type { Customer } from "@/lib/types";

/**
 * Type-to-search customer selector.
 *
 * A plain <select> was not an option: the customer list runs to thousands of
 * rows on a live install, and the operator taking the call knows the account by
 * whatever the caller reads out — code, username, name or phone — not by its
 * position in a dropdown. So the search goes to the API, which already matches
 * on all four in Customer::scopeFilter.
 */
export function CustomerPicker({ value, onChange, disabled }: {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // debounced: a keystroke-per-request storm makes the list flicker between
  // stale and fresh answers, and 250ms is below the threshold where the pause
  // reads as lag
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      api<Paginated<Customer>>("/customers", { params: { search: query, per_page: 8 } })
        .then((r) => setResults(r.data))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="min-w-0 truncate text-sm text-slate-900">
          {value.name} <span className="text-xs text-slate-400">{value.customer_code} · {value.username}</span>
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => { onChange(null); setQuery(""); }}
            className="shrink-0 text-xs font-medium text-slate-500 hover:text-rose-600"
          >
            Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <input
        className={inputCls}
        placeholder="Search customer code, name, username or phone…"
        value={query}
        disabled={disabled}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {loading && <p className="px-3 py-2 text-sm text-slate-400">Searching…</p>}
          {!loading && results.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No customers found.</p>}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">{c.name}</span>
              <span className="ml-1.5 text-xs text-slate-400">{c.customer_code} · {c.username}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
