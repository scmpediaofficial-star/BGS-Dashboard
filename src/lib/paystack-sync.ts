import "server-only";

import { ActionError } from "@/lib/actions";
import { recordEvent, type Actor } from "@/lib/events";
import { channelLabel, ensureCustomer, isPaystackConfigured, listPayments, type PaystackPayment } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, pluralize, truncate } from "@/lib/utils";

export type SyncResult = { payments: number; imported: number; linked: number; refunded: number; customers: number };

/**
 * Everyone who has paid carries a Paystack customer code. People who pay on
 * Paystack get one from Paystack; this gives one to a sale that was paid some
 * other way (bank transfer, cheque, cash) by adding the buyer to Paystack as a
 * customer. Needs the buyer's email, which is how Paystack identifies people.
 * Never throws: a sale must save even when Paystack is unreachable.
 */
export async function ensureSaleCustomer(saleId: string): Promise<string | null> {
  if (!isPaystackConfigured()) return null;
  const db = createAdminClient();
  const { data: sale } = await db.from("ticket_sales").select("id, buyer_name, buyer_email, buyer_phone, payment_status, paystack_customer_code").eq("id", saleId).maybeSingle();
  if (!sale) return null;
  if (sale.paystack_customer_code || sale.payment_status !== "paid" || !sale.buyer_email) return sale.paystack_customer_code;
  try {
    const customer = await ensureCustomer({ email: sale.buyer_email, name: sale.buyer_name, phone: sale.buyer_phone });
    const { error } = await db.from("ticket_sales").update({ paystack_customer_code: customer.code }).eq("id", sale.id);
    if (error) throw new Error(error.message);
    return customer.code;
  } catch (error) {
    console.error("[paystack] could not add the buyer as a customer:", saleId, error);
    return null;
  }
}

/** Where the automatic import keeps its own clock (app_settings). */
const STATE_KEY = "paystack_sync";
type SyncState = { attempted_at?: string; checked_at?: string; error?: string | null };

async function readState(): Promise<SyncState> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", STATE_KEY).maybeSingle();
  return (data?.value ?? {}) as SyncState;
}

async function writeState(state: SyncState): Promise<void> {
  const { error } = await createAdminClient().from("app_settings").upsert({ key: STATE_KEY, value: state, updated_at: new Date().toISOString() });
  if (error) console.error("[paystack] could not save sync state:", error.message);
}

/** When Paystack was last read successfully (ISO time), for "last checked" on the Payments page. */
export async function lastPaystackCheck(): Promise<{ checkedAt: string | null; error: string | null }> {
  const state = await readState();
  return { checkedAt: state.checked_at ?? null, error: state.error ?? null };
}

/**
 * The automatic import. Called from every place that can notice time passing —
 * a page being opened, the open Tickets and Payments screens once a minute, the
 * scheduler — so a payment becomes a sale and a ticket without anyone pressing
 * anything. It does nothing if Paystack was checked in the last `minSeconds`,
 * which keeps all those callers to roughly one Paystack request a minute between
 * them. Never throws.
 */
export async function autoSyncPaystack(minSeconds = 55): Promise<SyncResult | null> {
  if (!isPaystackConfigured()) return null;
  try {
    const state = await readState();
    const last = Date.parse(state.attempted_at ?? "");
    if (Number.isFinite(last) && Date.now() - last < minSeconds * 1000) return null;
    // Claim the slot first so callers arriving together don't all go to Paystack.
    await writeState({ ...state, attempted_at: new Date().toISOString() });
    return await syncPaystackSales();
  } catch (error) {
    console.error("[paystack] automatic import failed:", error);
    const message = error instanceof ActionError ? error.message : "The automatic import failed. It will try again shortly.";
    await writeState({ ...(await readState().catch(() => ({}))), attempted_at: new Date().toISOString(), error: message });
    return null;
  }
}

type SaleRef = { id: string; paystack_id: number | null; reference: string | null; payment_status: string; buyer_name: string };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function countryName(code: string | null): string {
  if (!code) return "Ghana";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? "Ghana";
  } catch {
    return "Ghana";
  }
}

/**
 * Brings the ticket ledger in line with Paystack: every successful payment
 * becomes one paid sale (its tickets are issued by the database), and a payment
 * Paystack has reversed turns its sale to "refunded", which voids the tickets.
 *
 * Idempotent — the manual button, the webhook and the scheduler may all run it
 * at once; the unique index on `paystack_id` keeps each payment to one sale.
 * Runs with the service role: callers check `payments.manage` (or the webhook
 * signature / cron secret) first.
 */
export async function syncPaystackSales(actor: Actor = null): Promise<SyncResult> {
  const db = createAdminClient();
  const [types, success, reversed] = await Promise.all([
    db.from("ticket_types").select("id, price, currency").eq("is_active", true).eq("is_virtual", false).order("sort_order").limit(1),
    listPayments({ status: "success" }),
    listPayments({ status: "reversed" }),
  ]);
  if (types.error) throw new Error(types.error.message);
  const type = types.data?.[0];
  if (!type) throw new ActionError("Add an in-person ticket type before importing Paystack payments.");

  // What the ledger already knows about these payments (by Paystack id, or by a reference typed in by hand).
  const payments = [...success.items, ...reversed.items];
  const known: SaleRef[] = [];
  for (const ids of chunk(payments.map((p) => p.id), 200)) {
    const { data, error } = await db.from("ticket_sales").select("id, paystack_id, reference, payment_status, buyer_name").in("paystack_id", ids);
    if (error) throw new Error(error.message);
    known.push(...(data ?? []));
  }
  for (const refs of chunk(success.items.map((p) => p.reference), 200)) {
    const { data, error } = await db.from("ticket_sales").select("id, paystack_id, reference, payment_status, buyer_name").is("paystack_id", null).in("reference", refs);
    if (error) throw new Error(error.message);
    known.push(...(data ?? []));
  }
  const byPaystackId = new Map(known.filter((s) => s.paystack_id !== null).map((s) => [s.paystack_id!, s]));
  const byReference = new Map(known.filter((s) => s.paystack_id === null && s.reference).map((s) => [s.reference!, s]));

  const price = Math.round(Number(type.price ?? 0) * 100);
  const fresh: PaystackPayment[] = [];
  let linked = 0;
  // Oldest first, so the ledger reads in the order people paid.
  for (const payment of [...success.items].reverse()) {
    if (byPaystackId.has(payment.id)) continue;
    const manual = byReference.get(payment.reference);
    if (manual) {
      const { error } = await db.from("ticket_sales").update({ paystack_id: payment.id, paystack_customer_code: payment.customer.code }).eq("id", manual.id);
      if (error) throw new Error(error.message);
      linked += 1;
      continue;
    }
    fresh.push(payment);
  }

  const rows = fresh.map((payment) => {
    const paid = Math.round(payment.amount * 100);
    // GH₵7,500 at GH₵2,500 a seat is three tickets; anything that doesn't divide cleanly is one.
    const quantity = price > 0 && payment.currency === type.currency && paid >= price && paid % price === 0 ? paid / price : 1;
    return {
      ticket_type_id: type.id,
      buyer_name: payment.customer.name,
      buyer_email: payment.customer.email,
      buyer_phone: payment.customer.phone,
      country: countryName(payment.country),
      quantity,
      amount: payment.amount,
      currency: payment.currency,
      channel: "website",
      payment_status: "paid" as const,
      reference: payment.reference,
      sold_at: payment.paidAt ?? payment.createdAt ?? new Date().toISOString(),
      notes: `Paid on Paystack${payment.method ? ` · ${payment.method}` : payment.channel ? ` · ${channelLabel(payment.channel)}` : ""}`,
      paystack_id: payment.id,
      paystack_customer_code: payment.customer.code,
      recorded_by: actor?.id ?? null,
    };
  });

  let imported: { id: string; buyer_name: string; amount: number; currency: string; quantity: number; reference: string | null }[] = [];
  if (rows.length) {
    const { data, error } = await db.from("ticket_sales").upsert(rows, { onConflict: "paystack_id", ignoreDuplicates: true }).select("id, buyer_name, amount, currency, quantity, reference");
    if (error) throw new Error(error.message);
    imported = data ?? [];
  }

  const refunded: SaleRef[] = [];
  for (const payment of reversed.items) {
    const sale = byPaystackId.get(payment.id);
    if (!sale || sale.payment_status !== "paid") continue;
    const { data, error } = await db.from("ticket_sales").update({ payment_status: "refunded" }).eq("id", sale.id).eq("payment_status", "paid").select("id");
    if (error) throw new Error(error.message);
    if (data?.length) refunded.push(sale);
  }

  // A person pressing "Sync" gets one line in the log; payments that arrive on their own are announced one by one.
  if (imported.length && (actor || imported.length > 3)) {
    const total = imported.reduce((sum, sale) => sum + Number(sale.amount), 0);
    await recordEvent({
      actor, action: "paystack.synced", category: "tickets", link: "/tickets", importance: "high", tone: "good",
      summary: actor ? `imported ${pluralize(imported.length, "Paystack payment")}` : `${pluralize(imported.length, "Paystack payment")} imported`,
      detail: `${formatMoney(total, imported[0].currency)} across ${pluralize(imported.reduce((sum, sale) => sum + sale.quantity, 0), "ticket")}. Tickets were issued automatically.`,
    });
  } else {
    for (const sale of imported) {
      await recordEvent({
        actor: null, action: "paystack.payment_received", category: "tickets", importance: "high", tone: "good",
        summary: `Paystack payment received from “${truncate(sale.buyer_name, 80)}”`,
        detail: `${pluralize(sale.quantity, "ticket")} issued automatically.`,
        entity: { type: "ticket_sale", id: sale.id, label: sale.buyer_name }, link: `/tickets?item=${sale.id}`,
        facts: [{ label: "Amount", value: formatMoney(Number(sale.amount), sale.currency) }, { label: "Tickets", value: String(sale.quantity) }, ...(sale.reference ? [{ label: "Reference", value: sale.reference }] : [])],
      });
    }
  }
  for (const sale of refunded) {
    await recordEvent({
      actor: null, action: "paystack.payment_reversed", category: "tickets", importance: "high", tone: "critical",
      summary: `Paystack reversed the payment from “${truncate(sale.buyer_name, 80)}”`,
      detail: "The sale is marked refunded and its tickets are void.",
      entity: { type: "ticket_sale", id: sale.id, label: sale.buyer_name }, link: `/tickets?item=${sale.id}`,
    });
  }

  // Paid sales still without a customer code (recorded by hand before Paystack was connected, or while it was down).
  let customers = 0;
  const { data: uncoded } = await db.from("ticket_sales").select("id").eq("payment_status", "paid").is("paystack_customer_code", null).not("buyer_email", "is", null).order("sold_at").limit(40);
  for (const sale of uncoded ?? []) if (await ensureSaleCustomer(sale.id)) customers += 1;

  const now = new Date().toISOString();
  await writeState({ attempted_at: now, checked_at: now, error: null });
  return { payments: success.items.length, imported: imported.length, linked, refunded: refunded.length, customers };
}
