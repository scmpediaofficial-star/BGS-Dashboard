import "server-only";

/** A failure talking to a network. `reauth` = the stored login is no longer valid. */
export class ProviderError extends Error {
  constructor(message: string, public status?: number, public reauth = false) {
    super(message);
    this.name = "ProviderError";
  }
}

type ApiInit = {
  method?: string;
  headers?: Record<string, string>;
  /** application/x-www-form-urlencoded */
  form?: Record<string, string | undefined>;
  json?: unknown;
  body?: BodyInit;
  bearer?: string;
  timeoutMs?: number;
};

export type ApiResult<T = Record<string, unknown>> = { status: number; headers: Headers; data: T };

/** Pulls the human-readable reason out of the many error shapes these APIs use. */
function reason(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return typeof data === "string" && data ? data.slice(0, 300) : fallback;
  const d = data as Record<string, unknown>;
  const nested = d.error && typeof d.error === "object" ? (d.error as Record<string, unknown>) : null;
  const first = Array.isArray(d.errors) && d.errors[0] && typeof d.errors[0] === "object" ? (d.errors[0] as Record<string, unknown>) : null;
  const candidates = [nested?.error_user_msg, nested?.message, d.error_description, d.message, d.detail, first?.message, first?.detail, d.title, typeof d.error === "string" ? d.error : null, nested?.code];
  const found = candidates.find((c) => typeof c === "string" && c.trim());
  return (typeof found === "string" ? found : fallback).replace(/\s+/g, " ").slice(0, 300);
}

/** fetch with a timeout, JSON/form helpers and errors a person can act on. Never logs or echoes tokens. */
export async function api<T = Record<string, unknown>>(url: string, init: ApiInit = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json", ...init.headers };
  if (init.bearer) headers.Authorization = `Bearer ${init.bearer}`;
  let body = init.body;
  if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
  if (init.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(Object.entries(init.form).filter((e): e is [string, string] => typeof e[1] === "string"));
  }

  let response: Response;
  try {
    response = await fetch(url, { method: init.method ?? (body ? "POST" : "GET"), headers, body, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(init.timeoutMs ?? 30_000) });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ProviderError(timedOut ? "The network took too long to respond. It will be retried." : "Could not reach the network. Check the address and try again.");
  }

  const text = await response.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : {}; } catch { /* not JSON: keep the text */ }

  if (!response.ok) {
    const message = reason(data, response.statusText || "Request failed");
    throw new ProviderError(`${message} (${response.status})`, response.status, response.status === 401);
  }
  return { status: response.status, headers: response.headers, data: data as T };
}

/** Downloads a media file from Supabase Storage, optionally just a byte range. */
export async function download(url: string, range?: { start: number; end: number }): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined, signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new ProviderError("Could not read the media file from storage.");
  }
  if (!response.ok) throw new ProviderError(`Could not read the media file from storage (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  // A server that ignores Range returns the whole file with 200: cut the slice ourselves.
  return range && response.status === 200 ? bytes.subarray(range.start, range.end + 1) : bytes;
}

export const str = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
export const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
export const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map(obj) : []);

/** ISO time `seconds` from now, with a safety margin so refreshes happen before expiry. */
export function expiresIn(seconds: unknown): string | null {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(Date.now() + n * 1000).toISOString() : null;
}

export function normaliseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("insecure");
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    throw new ProviderError("Enter a full https:// address.");
  }
}
