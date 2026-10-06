import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * BulkSMSGH (clientlogin.bulksmsgh.com), as the dashboard needs it.
 *
 * Called with BULKSMSGH_API_KEY, so nothing here is covered by row-level
 * security: check the `sms.send` capability before sending. The gateway
 * answers with a numeric code; both its JSON and plain-text replies are read.
 */

const BASE = "https://clientlogin.bulksmsgh.com";

export const isSmsConfigured = () => Boolean(serverEnv().bulkSmsKey);

/** Why the gateway said no, in its own words. */
export const SMS_CODES: Record<number, string> = {
  1000: "Message submitted successfully",
  1002: "SMS sending failed",
  1003: "Insufficient balance",
  1004: "Invalid API key",
  1005: "Invalid phone number",
  1006: "Invalid sender ID — must not exceed 11 characters including spaces",
  1007: "Message scheduled for later delivery",
  1008: "Empty message content",
  1009: "Sender ID not approved",
  1010: "Validation error",
};
const ACCEPTED = new Set([1000, 1007]);
/** Codes that are about the whole account, not one number: stop the blast rather than try every number. */
export const FATAL_CODES = new Set([1003, 1004, 1006, 1008, 1009]);

export type GatewayReply = { ok: boolean; code: number | null; error?: string; raw: string };

function readReply(raw: string, httpOk: boolean): GatewayReply {
  const text = raw.trim();
  let code: number | null = null;
  let message = "";
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const candidates = [json.code, json.status, json.status_code, json.response_code, (json.data as Record<string, unknown> | undefined)?.code];
    for (const c of candidates) {
      const n = typeof c === "number" ? c : typeof c === "string" && /^\d{4}$/.test(c) ? Number(c) : null;
      if (n !== null) { code = n; break; }
    }
    message = String(json.message ?? json.msg ?? json.description ?? json.error ?? "");
  } catch {
    const m = text.match(/\b(10\d{2})\b/);
    if (m) code = Number(m[1]);
    message = text;
  }
  if (code !== null && ACCEPTED.has(code)) return { ok: true, code, raw: text };
  const reason = code !== null ? SMS_CODES[code] ?? `Gateway error ${code}` : httpOk ? "The gateway gave an unexpected reply" : "The gateway could not be reached";
  return { ok: false, code, error: message && message !== String(code) ? `${reason} (${message.slice(0, 120)})` : reason, raw: text };
}

/** One request: the same text to every number given (the gateway takes them comma-separated). */
export async function sendSms(to: string[], message: string, senderId: string): Promise<GatewayReply> {
  const key = serverEnv().bulkSmsKey;
  if (!key) return { ok: false, code: null, error: "BULKSMSGH_API_KEY is not set", raw: "" };
  const params = new URLSearchParams({ key, to: to.join(","), msg: message, sender_id: senderId });
  try {
    let response = await fetch(`${BASE}/smsapi`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params, cache: "no-store", signal: AbortSignal.timeout(25_000) });
    // The documentation shows the same call as a plain URL; fall back to that if POST is refused.
    if (response.status === 404 || response.status === 405) response = await fetch(`${BASE}/smsapi?${params}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
    return readReply(await response.text(), response.ok);
  } catch (error) {
    console.error("[sms] network error:", error);
    return { ok: false, code: null, error: "We couldn't reach BulkSMSGH. Check the connection and try again.", raw: "" };
  }
}

export type SmsBalance = { units: number | null; label: string };

/** The SMS credits left on the account, or what the gateway said when it couldn't be read. */
export async function getSmsBalance(): Promise<SmsBalance> {
  const key = serverEnv().bulkSmsKey;
  if (!key) return { units: null, label: "Not connected" };
  for (const path of ["/api/smsapibalance", "/api/balance/sms"]) {
    try {
      const response = await fetch(`${BASE}${path}?key=${encodeURIComponent(key)}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const text = (await response.text()).trim();
      if (!response.ok) continue;
      const units = readBalance(text);
      if (units !== null) return { units, label: `${units.toLocaleString("en-GB")} SMS` };
      if (text && text.length < 80) return { units: null, label: text };
    } catch (error) {
      console.error("[sms] balance:", path, error);
    }
  }
  return { units: null, label: "Balance unavailable" };
}

function readBalance(text: string): number | null {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const data = (json.data && typeof json.data === "object" ? json.data : {}) as Record<string, unknown>;
    for (const v of [json.balance, json.sms_balance, json.credit, json.credits, json.units, data.balance, data.sms_balance, data.credit, data.credits, data.units]) {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : NaN;
      if (Number.isFinite(n)) return n;
    }
    return null;
  } catch {
    const m = text.match(/-?\d[\d,]*(?:\.\d+)?/);
    return m ? Number(m[0].replace(/,/g, "")) : null;
  }
}
