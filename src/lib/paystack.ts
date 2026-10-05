import "server-only";

import { createHmac } from "node:crypto";
import { ActionError } from "@/lib/actions";
import { safeEqual } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";

/**
 * Paystack, as the dashboard needs it.
 *
 * Every call is made on the server with PAYSTACK_SECRET_KEY, so nothing here
 * is covered by row-level security: check a `payments.*` capability before
 * calling. Results are trimmed to plain, display-ready shapes — raw Paystack
 * objects (which carry authorisation codes and device details) never reach
 * the browser. Money is converted from pesewas/kobo to whole currency units.
 */

export function isPaystackConfigured(): boolean {
  return Boolean(serverEnv().paystackSecretKey);
}

/** "live" or "test", read from the key itself. */
export function paystackMode(): "live" | "test" | null {
  const key = serverEnv().paystackSecretKey;
  if (!key) return null;
  return key.startsWith("sk_test_") ? "test" : "live";
}

type Query = Record<string, string | number | boolean | null | undefined>;
type Envelope<T> = { status: boolean; message: string; data: T; meta?: { total?: number; page?: number; pageCount?: number; perPage?: number } };

async function request<T>(path: string, init: { method?: "GET" | "POST" | "PUT"; query?: Query; body?: unknown; missingOk?: boolean } = {}): Promise<Envelope<T>> {
  const { paystackSecretKey: key, paystackApiUrl: base } = serverEnv();
  if (!key) throw new ActionError("Paystack is not connected yet. Add PAYSTACK_SECRET_KEY to the deployment's environment variables.");

  const url = new URL(`${base}${path}`);
  for (const [name, value] of Object.entries(init.query ?? {})) {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(name, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${key}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error("[paystack] network error:", path, error);
    throw new ActionError("We couldn't reach Paystack. Check the connection and try again.");
  }

  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !payload?.status) {
    if (init.missingOk && (response.status === 404 || response.status === 400)) return { status: false, message: payload?.message ?? "Not found", data: null as T };
    if (response.status === 401) throw new ActionError("Paystack rejected the secret key. Check PAYSTACK_SECRET_KEY.");
    console.error("[paystack]", response.status, path, payload?.message);
    // Paystack's own messages are written for merchants ("Customer already exists"), so they are safe to show.
    throw new ActionError(payload?.message ? `Paystack: ${payload.message}` : "Paystack could not complete that request. Please try again.");
  }
  return payload;
}

/** Walks a paginated list. `truncated` is true when Paystack holds more than we fetched. */
async function listAll<T>(path: string, query: Query = {}, maxPages = 10): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data, meta } = await request<T[]>(path, { query: { ...query, perPage: 100, page } });
    items.push(...(data ?? []));
    const last = (data ?? []).length < 100 || (meta?.pageCount !== undefined && page >= meta.pageCount);
    if (last) return { items, truncated: false };
  }
  return { items, truncated: true };
}

const major = (subunits: number | null | undefined): number => Math.round(Number(subunits ?? 0)) / 100;
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

// ── Customers ───────────────────────────────────────────────────────────────
type RawCustomer = {
  id: number; customer_code: string; email: string; first_name?: string | null; last_name?: string | null; phone?: string | null;
  risk_action?: string | null; createdAt?: string; created_at?: string; metadata?: unknown;
};

export type Risk = "default" | "allow" | "deny";
export type PaystackCustomer = {
  id: number; code: string; email: string; firstName: string; lastName: string; name: string; phone: string | null; risk: Risk; createdAt: string | null;
};

function customerName(raw: Pick<RawCustomer, "first_name" | "last_name" | "email">): string {
  return [text(raw.first_name), text(raw.last_name)].filter(Boolean).join(" ");
}

function toCustomer(raw: RawCustomer): PaystackCustomer {
  const risk = raw.risk_action === "allow" || raw.risk_action === "deny" ? raw.risk_action : "default";
  return {
    id: raw.id, code: raw.customer_code, email: raw.email, firstName: text(raw.first_name) ?? "", lastName: text(raw.last_name) ?? "",
    name: customerName(raw), phone: text(raw.phone), risk, createdAt: raw.createdAt ?? raw.created_at ?? null,
  };
}

export async function listCustomers(): Promise<{ items: PaystackCustomer[]; truncated: boolean }> {
  const { items, truncated } = await listAll<RawCustomer>("/customer");
  return { items: items.map(toCustomer), truncated };
}

export type CustomerInput = { email: string; first_name: string; last_name: string; phone?: string | null };

export async function createCustomer(input: CustomerInput): Promise<PaystackCustomer> {
  const { data } = await request<RawCustomer>("/customer", { method: "POST", body: { email: input.email, first_name: input.first_name, last_name: input.last_name, ...(input.phone ? { phone: input.phone } : {}) } });
  return toCustomer(data);
}

export async function updateCustomer(code: string, input: Omit<CustomerInput, "email">): Promise<PaystackCustomer> {
  const { data } = await request<RawCustomer>(`/customer/${encodeURIComponent(code)}`, { method: "PUT", body: { first_name: input.first_name, last_name: input.last_name, phone: input.phone ?? "" } });
  return toCustomer(data);
}

/** Looks a customer up by email address or customer code; null when Paystack has no such customer. */
export async function findCustomer(emailOrCode: string): Promise<PaystackCustomer | null> {
  const { data } = await request<RawCustomer | null>(`/customer/${encodeURIComponent(emailOrCode.trim())}`, { missingOk: true });
  return data?.customer_code ? toCustomer(data) : null;
}

/**
 * The Paystack customer for this person, created if they are not one yet —
 * which is how someone who paid by bank transfer or cheque still gets a
 * customer code. A phone number Paystack won't accept is left out rather than
 * blocking the customer.
 */
export async function ensureCustomer(input: { email: string; name: string; phone?: string | null }): Promise<PaystackCustomer> {
  const email = input.email.trim().toLowerCase();
  const existing = await findCustomer(email);
  if (existing) return existing;
  const words = input.name.trim().split(/\s+/);
  const names = { first_name: words.slice(0, Math.max(1, words.length - 1)).join(" "), last_name: words.length > 1 ? words[words.length - 1] : "" };
  try {
    return await createCustomer({ email, ...names, phone: input.phone });
  } catch (error) {
    if (!input.phone) throw error;
    return createCustomer({ email, ...names });
  }
}

/** allow = whitelist, deny = blacklist, default = let Paystack decide. */
export async function setCustomerRisk(code: string, risk: Risk): Promise<void> {
  await request("/customer/set_risk_action", { method: "POST", body: { customer: code, risk_action: risk } });
}

// ── Payments (Paystack calls them transactions) ─────────────────────────────
type RawAuthorization = { channel?: string | null; brand?: string | null; card_type?: string | null; last4?: string | null; bank?: string | null; country_code?: string | null; mobile_money_number?: string | null };
type RawTransaction = {
  id: number; reference: string; status: string; amount: number; currency: string; channel?: string | null; fees?: number | null;
  paid_at?: string | null; paidAt?: string | null; created_at?: string | null; createdAt?: string | null; gateway_response?: string | null;
  receipt_number?: string | number | null; metadata?: unknown; customer?: RawCustomer | null; authorization?: RawAuthorization | null;
};

export type PaystackPayment = {
  id: number; reference: string; status: string; amount: number; currency: string; channel: string | null; method: string | null; fees: number | null;
  paidAt: string | null; createdAt: string | null; message: string | null; receipt: string | null; country: string | null;
  customer: { code: string | null; email: string | null; name: string; phone: string | null };
};

const CHANNEL_LABEL: Record<string, string> = { card: "Card", mobile_money: "Mobile money", bank_transfer: "Bank transfer", bank: "Bank", ussd: "USSD", qr: "QR", apple_pay: "Apple Pay", eft: "EFT" };
export const channelLabel = (channel: string | null | undefined): string => (channel ? CHANNEL_LABEL[channel] ?? channel.replace(/_/g, " ") : "—");

/** "MTN mobile money ••7112", "Visa ••4081" — never the full number. */
function describeMethod(auth: RawAuthorization | null | undefined, channel: string | null | undefined): string | null {
  if (!auth) return channel ? channelLabel(channel) : null;
  const kind = auth.channel ?? channel;
  if (kind === "mobile_money") {
    const digits = text(auth.mobile_money_number)?.slice(-4) ?? text(auth.last4);
    return [text(auth.bank), "mobile money", digits ? `••${digits}` : null].filter(Boolean).join(" ");
  }
  if (kind === "card") return [text(auth.brand) ?? text(auth.card_type) ?? "Card", text(auth.last4) ? `••${auth.last4}` : null].filter(Boolean).join(" ").replace(/^./, (c) => c.toUpperCase());
  return [text(auth.bank), channelLabel(kind)].filter(Boolean).join(" · ") || null;
}

/** A name typed on the payment page lives in metadata when the customer record has none. */
function metadataName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as { custom_fields?: unknown; name?: unknown; full_name?: unknown };
  const direct = text(meta.full_name) ?? text(meta.name);
  if (direct) return direct;
  if (!Array.isArray(meta.custom_fields)) return null;
  for (const field of meta.custom_fields as { display_name?: unknown; variable_name?: unknown; value?: unknown }[]) {
    if (/name/i.test(`${text(field?.display_name) ?? ""} ${text(field?.variable_name) ?? ""}`) && text(field?.value)) return text(field.value);
  }
  return null;
}

function toPayment(raw: RawTransaction): PaystackPayment {
  const customer = raw.customer ?? null;
  return {
    id: raw.id, reference: raw.reference, status: raw.status, amount: major(raw.amount), currency: raw.currency, channel: raw.channel ?? null,
    method: describeMethod(raw.authorization, raw.channel), fees: raw.fees === null || raw.fees === undefined ? null : major(raw.fees),
    paidAt: raw.paid_at ?? raw.paidAt ?? null, createdAt: raw.created_at ?? raw.createdAt ?? null, message: text(raw.gateway_response),
    receipt: raw.receipt_number === null || raw.receipt_number === undefined ? null : String(raw.receipt_number),
    country: text(raw.authorization?.country_code),
    customer: {
      code: customer?.customer_code ?? null, email: customer?.email ?? null, phone: text(customer?.phone),
      name: (customer ? customerName(customer) : "") || metadataName(raw.metadata) || customer?.email || "Unknown customer",
    },
  };
}

export async function listPayments(query: { status?: string; customer?: number } = {}): Promise<{ items: PaystackPayment[]; truncated: boolean }> {
  const { items, truncated } = await listAll<RawTransaction>("/transaction", query);
  return { items: items.map(toPayment), truncated };
}

export async function getPayment(id: number): Promise<PaystackPayment> {
  const { data } = await request<RawTransaction>(`/transaction/${id}`);
  return toPayment(data);
}

/** A hosted checkout link for one person and one amount. Nothing is charged until they pay. */
export async function createPaymentLink(input: { email: string; amount: number; currency: string; metadata?: Record<string, unknown> }): Promise<{ url: string; reference: string }> {
  const { data } = await request<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: { email: input.email, amount: Math.round(input.amount * 100), currency: input.currency, metadata: input.metadata ?? {} },
  });
  return { url: data.authorization_url, reference: data.reference };
}

// ── Refunds ─────────────────────────────────────────────────────────────────
type RawRefund = {
  id: number; transaction: number | { id: number; reference?: string } | null; amount: number; currency: string; status: string;
  refunded_at?: string | null; createdAt?: string | null; created_at?: string | null; customer_note?: string | null; merchant_note?: string | null; refunded_by?: string | null;
  transaction_reference?: string | null; customer?: RawCustomer | null;
};

export type PaystackRefund = {
  id: number; paymentId: number | null; reference: string | null; amount: number; currency: string; status: string; createdAt: string | null; refundedAt: string | null;
  customerNote: string | null; merchantNote: string | null; refundedBy: string | null; customerEmail: string | null;
};

function toRefund(raw: RawRefund): PaystackRefund {
  const tx = raw.transaction;
  return {
    id: raw.id, paymentId: typeof tx === "number" ? tx : tx?.id ?? null,
    reference: text(raw.transaction_reference) ?? (typeof tx === "object" && tx ? text(tx.reference) : null),
    amount: major(raw.amount), currency: raw.currency, status: raw.status, createdAt: raw.createdAt ?? raw.created_at ?? null, refundedAt: raw.refunded_at ?? null,
    customerNote: text(raw.customer_note), merchantNote: text(raw.merchant_note), refundedBy: text(raw.refunded_by), customerEmail: raw.customer?.email ?? null,
  };
}

export async function listRefunds(): Promise<{ items: PaystackRefund[]; truncated: boolean }> {
  const { items, truncated } = await listAll<RawRefund>("/refund");
  return { items: items.map(toRefund), truncated };
}

/** Leave `amount` out to refund the payment in full. */
export async function createRefund(input: { paymentId: number; amount?: number | null; currency?: string; customerNote?: string | null; merchantNote?: string | null }): Promise<PaystackRefund> {
  const { data } = await request<RawRefund>("/refund", {
    method: "POST",
    body: {
      transaction: input.paymentId,
      ...(input.amount ? { amount: Math.round(input.amount * 100), currency: input.currency } : {}),
      ...(input.customerNote ? { customer_note: input.customerNote } : {}),
      ...(input.merchantNote ? { merchant_note: input.merchantNote } : {}),
    },
  });
  return toRefund(data);
}

// ── Payouts (settlements), disputes, payment pages, balance ─────────────────
type RawSettlement = { id: number; status: string; currency: string; total_amount?: number | null; effective_amount?: number | null; total_fees?: number | null; total_processed?: number | null; settlement_date?: string | null; createdAt?: string | null };
export type PaystackPayout = { id: number; status: string; currency: string; amount: number; processed: number | null; fees: number | null; settledAt: string | null };

export async function listPayouts(): Promise<{ items: PaystackPayout[]; truncated: boolean }> {
  const { items, truncated } = await listAll<RawSettlement>("/settlement");
  return {
    truncated,
    items: items.map((raw) => ({
      id: raw.id, status: raw.status, currency: raw.currency, amount: major(raw.effective_amount ?? raw.total_amount),
      processed: raw.total_processed === null || raw.total_processed === undefined ? null : major(raw.total_processed),
      fees: raw.total_fees === null || raw.total_fees === undefined ? null : major(raw.total_fees), settledAt: raw.settlement_date ?? raw.createdAt ?? null,
    })),
  };
}

type RawDispute = { id: number; status: string; refund_amount?: number | null; currency?: string | null; category?: string | null; resolution?: string | null; dueAt?: string | null; resolvedAt?: string | null; createdAt?: string | null; transaction?: { id?: number; reference?: string; amount?: number; currency?: string } | null; customer?: RawCustomer | null };
export type PaystackDispute = { id: number; status: string; amount: number; currency: string; category: string | null; resolution: string | null; dueAt: string | null; resolvedAt: string | null; createdAt: string | null; reference: string | null; customerEmail: string | null };

export async function listDisputes(): Promise<{ items: PaystackDispute[]; truncated: boolean }> {
  const { items, truncated } = await listAll<RawDispute>("/dispute");
  return {
    truncated,
    items: items.map((raw) => ({
      id: raw.id, status: raw.status, amount: major(raw.refund_amount ?? raw.transaction?.amount), currency: raw.currency ?? raw.transaction?.currency ?? "GHS",
      category: text(raw.category), resolution: text(raw.resolution), dueAt: raw.dueAt ?? null, resolvedAt: raw.resolvedAt ?? null, createdAt: raw.createdAt ?? null,
      reference: text(raw.transaction?.reference), customerEmail: raw.customer?.email ?? null,
    })),
  };
}

type RawPage = { id: number; name: string; description?: string | null; amount?: number | null; currency?: string | null; slug: string; active?: boolean | null; createdAt?: string | null };
export type PaystackPage = { id: number; name: string; description: string | null; amount: number | null; currency: string; url: string; active: boolean; createdAt: string | null };

export async function listPaymentPages(): Promise<{ items: PaystackPage[]; truncated: boolean }> {
  const { items, truncated } = await listAll<RawPage>("/page");
  return {
    truncated,
    items: items.map((raw) => ({
      id: raw.id, name: raw.name, description: text(raw.description), amount: raw.amount ? major(raw.amount) : null, currency: raw.currency ?? "GHS",
      url: `https://paystack.com/pay/${raw.slug}`, active: raw.active !== false, createdAt: raw.createdAt ?? null,
    })),
  };
}

export type PaystackBalance = { currency: string; balance: number };

export async function getBalance(): Promise<PaystackBalance[]> {
  const { data } = await request<{ currency: string; balance: number }[]>("/balance");
  return (data ?? []).map((row) => ({ currency: row.currency, balance: major(row.balance) }));
}

// ── Webhook ─────────────────────────────────────────────────────────────────
/** Paystack signs each webhook body with HMAC-SHA512 of the secret key. */
export function isValidWebhook(rawBody: string, signature: string | null): boolean {
  const key = serverEnv().paystackSecretKey;
  if (!key || !signature) return false;
  return safeEqual(createHmac("sha512", key).update(rawBody).digest("hex"), signature.trim().toLowerCase());
}
