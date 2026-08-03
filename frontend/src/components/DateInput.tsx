"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { inputBaseCls } from "@/components/ui";

/**
 * Date field that reads and writes dd/mm/yyyy.
 *
 * A native <input type="date"> renders its value in the *browser's* locale,
 * not the page's — so the same field showed mm/dd/yyyy to staff on a US-locale
 * machine and dd/mm/yyyy to everyone else, with nothing in the markup able to
 * change it. 03/08 means two different days depending on whose desk you are
 * sitting at, which is not a thing a billing screen can leave to chance.
 *
 * So the visible control is a text input we format ourselves. The value handed
 * to and returned from the parent stays ISO yyyy-mm-dd, unchanged, because
 * that is what the API takes and what <input type="date"> used to emit — no
 * caller had to change.
 *
 * The calendar button opens the browser's own picker through a hidden native
 * input, so the convenience of clicking a date survives. It is positioned
 * rather than display:none because showPicker() refuses to open on an element
 * that is not being rendered.
 */
export function DateInput({ value, onChange, className = "", id, disabled, title }: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const picker = useRef<HTMLInputElement>(null);

  // Follow the parent when it changes the value itself (form reset, a dialog
  // reopening for another customer), without fighting the operator mid-type.
  useEffect(() => {
    setText((current) => (displayToIso(current) === value ? current : isoToDisplay(value)));
  }, [value]);

  function handle(next: string) {
    const masked = mask(next);
    setText(masked);

    if (masked === "") {
      onChange("");
      return;
    }
    const iso = displayToIso(masked);
    if (iso) onChange(iso);
  }

  const invalid = text !== "" && displayToIso(text) === null;

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        disabled={disabled}
        title={title}
        value={text}
        onChange={(e) => handle(e.target.value)}
        className={`${inputBaseCls} w-full pr-9 ${invalid ? "border-rose-400 focus:border-rose-400 focus:ring-rose-500/15" : ""}`}
        aria-invalid={invalid}
      />

      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Open calendar"
        onClick={() => picker.current?.showPicker?.()}
        className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50"
      >
        <Icon name="calendar" />
      </button>

      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setText(isoToDisplay(e.target.value));
        }}
        className="pointer-events-none absolute right-2 top-4 h-px w-px opacity-0"
      />
    </div>
  );
}

/** yyyy-mm-dd -> dd/mm/yyyy ("" for anything else, including a bare year). */
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * dd/mm/yyyy -> yyyy-mm-dd, or null when it is not a real date.
 *
 * Rebuilding the date and comparing the parts back is what rejects 31/02:
 * Date() would happily roll that forward to 3 March and store a day the
 * operator never typed.
 */
function displayToIso(display: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(display.trim());
  if (!m) return null;

  const [, d, mo, y] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getUTCDate() !== Number(d) || parsed.getUTCMonth() + 1 !== Number(mo)) return null;

  return iso;
}

/**
 * Keep the field to digits and drop the separators in as they are typed.
 *
 * A slash typed after a single digit pads it first, so "3/8/2026" and
 * "03082026" both land on 03/08/2026 — without that, the slash is stripped
 * and the next digit slides into the day, turning 3 August into the 38th.
 */
function mask(input: string): string {
  const padded = input
    .replace(/[^\d/]/g, "")
    .replace(/^(\d)\//, "0$1/")
    .replace(/^(\d{2}\/)(\d)\//, "$10$2/");

  // A separator the operator just typed is kept, so the field reads "03/"
  // rather than snapping back to "03" until the next digit arrives.
  const trailing = padded.endsWith("/") ? "/" : "";
  const digits = padded.replace(/\D/g, "").slice(0, 8);

  if (digits.length < 2) return digits;
  if (digits.length === 2) return `${digits}${trailing}`;
  if (digits.length < 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length === 4) return `${digits.slice(0, 2)}/${digits.slice(2)}${trailing}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
