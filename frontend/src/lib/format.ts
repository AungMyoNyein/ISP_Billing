export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatMoney(amount: number | string, currency = "MMK"): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${(n ?? 0).toLocaleString()} ${currency}`;
}

/**
 * Dates render as day-month-year ("31 Jul 2026") everywhere.
 *
 * The locale is pinned to en-GB rather than left as `undefined`: with the
 * browser locale the same record renders as US month-first (or an all-numeric
 * MM/DD/YY on locales that ignore the options), so what staff saw depended on
 * whose machine they sat at. 07/08/26 is genuinely ambiguous across a customer
 * base; a spelled-out month never is.
 */
const DATE_LOCALE = "en-GB";

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(DATE_LOCALE, {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  const date = d.toLocaleDateString(DATE_LOCALE, { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(DATE_LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}, ${time}`;
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function speedLabel(kbps: number): string {
  return kbps >= 1024 ? `${(kbps / 1024).toFixed(kbps % 1024 === 0 ? 0 : 1)} Mbps` : `${kbps} kbps`;
}
