import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The summit runs on Accra time (GMT, no daylight saving). Server and client format identically. */
export const EVENT_TZ = "Africa/Accra";
const LOCALE = "en-GB";

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  // A bare date ("2026-10-07") is a calendar day, not an instant: pin it to noon so no timezone can shift it.
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: DateInput, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: EVENT_TZ,
    day: "numeric",
    month: "short",
    ...(opts.year === false ? {} : { year: "numeric" }),
    ...(opts.weekday ? { weekday: "short" } : {}),
  }).format(date);
}

export function formatTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(LOCALE, { timeZone: EVENT_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return "—";
  return `${formatDate(date, { weekday: true })} · ${formatTime(date)} GMT`;
}

/** YYYY-MM-DD for the given instant, in Accra. */
export function isoDay(value: DateInput = new Date()): string {
  const date = toDate(value) ?? new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Whole calendar days from today (Accra) until `value`. Negative = in the past. */
export function daysUntil(value: DateInput, from: DateInput = new Date()): number | null {
  const target = toDate(value);
  if (!target) return null;
  const a = Date.parse(`${isoDay(from)}T00:00:00Z`);
  const b = Date.parse(`${isoDay(target)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function relativeDay(value: DateInput): string {
  const days = daysUntil(value);
  if (days === null) return "No date";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days <= 14) return `In ${days} days`;
  if (days < -1 && days >= -14) return `${-days} days ago`;
  return formatDate(value);
}

export function timeAgo(value: DateInput, now: number = Date.now()): string {
  const date = toDate(value);
  if (!date) return "—";
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(date, { year: date.getFullYear() !== new Date(now).getFullYear() });
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(LOCALE).format(value);
}

/** Auto-compact figures for stat tiles: 1,284 · 12.9K · 4.2M */
export function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) < 10_000) return formatNumber(Math.round(value));
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatMoney(value: number | null | undefined, currency = "GHS", compact = false): string {
  if (value === null || value === undefined) return "—";
  const symbol = currency === "GHS" ? "GH₵" : currency === "USD" ? "$" : `${currency} `;
  const body = compact && Math.abs(value) >= 10_000
    ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : new Intl.NumberFormat(LOCALE, { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(value);
  return `${symbol}${body}`;
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function initials(name: string | null | undefined): string {
  const words = (name ?? "")
    .replace(/\b(prof|professor|dr|mr|mrs|ms|madam|ing|chief|hon)\.?\s/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      (acc[key(item)] ??= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

/** Minimal RFC 4180 CSV writer for exports. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) => row.map((cell) => {
      const text = cell === null || cell === undefined ? "" : String(cell);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(","))
    .join("\n");
}
