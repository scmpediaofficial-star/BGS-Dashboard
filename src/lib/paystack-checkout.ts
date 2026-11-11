import "server-only";

import { recordEvent, type Actor } from "@/lib/events";
import { getProduct, isPaystackConfigured, listPaymentPages, listProducts, setPageActive, updateProduct } from "@/lib/paystack";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime, formatMoney, isoDay } from "@/lib/utils";

/**
 * Opening and closing online payments: every Paystack payment page and product
 * (the in-person ticket, the Zoom registration pages) at once, now or at a set time.
 *
 * Runs with the secret key, so callers check `payments.manage` first — except
 * closeCheckoutsIfDue(), which only carries out a close someone already scheduled.
 */

export type Checkout = { key: string; kind: "page" | "product"; id: number; name: string; url: string | null; amount: number | null; currency: string; open: boolean };
export type CheckoutSchedule = {
  /** When payments close by themselves (ISO time), or null when no close is set. */
  closeAt: string | null;
  /** True while that time is the default (18:00 on the eve of the summit) rather than one someone chose. */
  isDefault: boolean;
  /** When the scheduled close was carried out. */
  closedAt: string | null;
};

const STATE_KEY = "paystack_checkout";
type State = {
  close_at?: string | null;
  closed_at?: string | null;
  attempts?: number;
  /** Changes whenever someone opens, closes or reschedules, so a new scheduled close gets fresh claims. */
  round?: string;
  /** A product's stock before it was set to zero, so reopening puts it back. */
  stock?: Record<string, { unlimited: boolean; quantity: number | null }>;
};

async function readState(): Promise<{ state: State; saved: boolean }> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", STATE_KEY).maybeSingle();
  return { state: (data?.value ?? {}) as State, saved: Boolean(data) };
}

async function writeState(state: State): Promise<void> {
  const { error } = await createAdminClient().from("app_settings").upsert({ key: STATE_KEY, value: state, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/**
 * Online payments close at 18:00 Accra time on the eve of the summit unless someone sets another time.
 * Accra keeps GMT all year, so Accra wall-clock time is UTC. A default more than 12 hours gone
 * is ignored, so a wrong event date in Settings can never close payments out of the blue.
 */
function defaultCloseAt(startsAt: string | null | undefined): string | null {
  const start = Date.parse(startsAt ?? "");
  if (!Number.isFinite(start)) return null;
  const eve = new Date(`${isoDay(new Date(start))}T18:00:00Z`);
  eve.setUTCDate(eve.getUTCDate() - 1);
  return eve.getTime() > Date.now() - 12 * 3_600_000 ? eve.toISOString() : null;
}

function resolveCloseAt(state: State, saved: boolean, startsAt: string | null | undefined): { closeAt: string | null; isDefault: boolean } {
  if (saved && "close_at" in state) return { closeAt: state.close_at ?? null, isDefault: false };
  return { closeAt: defaultCloseAt(startsAt), isDefault: true };
}

export async function getCheckoutSchedule(): Promise<CheckoutSchedule> {
  const [{ state, saved }, settings] = await Promise.all([readState(), getSettings()]);
  return { ...resolveCloseAt(state, saved, settings.event.starts_at), closedAt: state.closed_at ?? null };
}

/** Every payment page and product on the Paystack account, open or closed. */
export async function listCheckouts(): Promise<Checkout[]> {
  const [pages, products] = await Promise.all([listPaymentPages(), listProducts()]);
  return [
    ...products.items.map((p): Checkout => ({ key: `product:${p.id}`, kind: "product", id: p.id, name: p.name, url: p.url, amount: p.price, currency: p.currency, open: p.active && p.inStock })),
    ...pages.items.map((p): Checkout => ({ key: `page:${p.id}`, kind: "page", id: p.id, name: p.name, url: p.url, amount: p.amount, currency: p.currency, open: p.active })),
  ];
}

/** Closes or reopens one product. Tries Paystack's on/off switch first; if the product still sells, its stock goes to zero. */
async function setProductOpen(id: number, open: boolean, stock: NonNullable<State["stock"]>): Promise<boolean> {
  const key = String(id);
  if (!open) {
    const before = await getProduct(id);
    if (!before.active || !before.inStock) return false;
    await updateProduct(id, { active: false }).catch((error) => console.error("[checkout] product switch refused:", id, error));
    const after = await getProduct(id);
    if (!after.active || !after.inStock) return false;
    stock[key] = { unlimited: before.unlimited, quantity: before.quantity };
    await updateProduct(id, { unlimited: false, quantity: 0 });
    const last = await getProduct(id);
    return last.active && last.inStock;
  }
  const before = await getProduct(id);
  if (!before.active) await updateProduct(id, { active: true }).catch((error) => console.error("[checkout] product switch refused:", id, error));
  const after = await getProduct(id);
  if (!after.inStock) {
    const saved = stock[key];
    await updateProduct(id, saved && !saved.unlimited && saved.quantity ? { unlimited: false, quantity: saved.quantity } : { unlimited: true });
  }
  delete stock[key];
  const last = await getProduct(id);
  return last.active && last.inStock;
}

async function applyOpen(open: boolean, stock: NonNullable<State["stock"]>): Promise<{ changed: Checkout[]; failed: Checkout[]; checkouts: Checkout[] }> {
  const before = await listCheckouts();
  const targets = before.filter((c) => c.open !== open);
  const failed: Checkout[] = [];
  for (const checkout of targets) {
    try {
      const nowOpen = checkout.kind === "page" ? await setPageActive(checkout.id, open) : await setProductOpen(checkout.id, open, stock);
      if (nowOpen !== open) failed.push(checkout);
    } catch (error) {
      console.error("[checkout] could not switch", checkout.key, error);
      failed.push(checkout);
    }
  }
  const checkouts = await listCheckouts().catch(() => before);
  const failedKeys = new Set(failed.map((c) => c.key));
  return { changed: targets.filter((c) => !failedKeys.has(c.key)), failed, checkouts };
}

const priced = (c: Checkout) => (c.amount === null ? c.name : `${c.name} (${formatMoney(c.amount, c.currency)})`);

/** "Close all now" and "Reopen all". */
export async function setCheckoutsOpen(open: boolean, actor: Actor): Promise<{ changed: Checkout[]; failed: Checkout[]; checkouts: Checkout[] }> {
  const [{ state, saved }, settings] = await Promise.all([readState(), getSettings()]);
  const stock = { ...(state.stock ?? {}) };
  const result = await applyOpen(open, stock);
  const { closeAt } = resolveCloseAt(state, saved, settings.event.starts_at);
  // Reopening after the close time has passed also clears that time, or the scheduler would close everything again a minute later.
  const keepTime = closeAt !== null && Date.parse(closeAt) > Date.now();
  await writeState({ ...state, stock, close_at: open && !keepTime ? null : closeAt, closed_at: open ? null : state.closed_at ?? new Date().toISOString(), attempts: 0, round: crypto.randomUUID() });

  if (result.changed.length || result.failed.length) {
    await recordEvent({
      actor, action: open ? "paystack.checkouts_opened" : "paystack.checkouts_closed", category: "tickets", link: "/payments", importance: "high",
      tone: result.failed.length ? "critical" : open ? "good" : "warning", audience: "managers",
      summary: open ? "reopened online payments on Paystack" : "closed online payments on Paystack",
      detail: [
        result.changed.length ? `${open ? "Reopened" : "Closed"}: ${result.changed.map(priced).join(", ")}.` : null,
        result.failed.length ? `Still ${open ? "closed" : "open"}: ${result.failed.map(priced).join(", ")}. Change ${result.failed.length === 1 ? "it" : "them"} in the Paystack dashboard.` : null,
      ].filter(Boolean).join(" "),
    });
  }
  return result;
}

/** Sets (or, with null, cancels) the time online payments close by themselves. */
export async function scheduleCheckoutClose(closeAt: string | null, actor: Actor): Promise<void> {
  const { state } = await readState();
  await writeState({ ...state, close_at: closeAt, closed_at: null, attempts: 0, round: crypto.randomUUID() });
  await recordEvent({
    actor, action: "paystack.checkouts_scheduled", category: "tickets", link: "/payments", audience: "managers", importance: "high", tone: closeAt ? "warning" : "default",
    summary: closeAt ? `set online payments to close at ${formatDateTime(closeAt)}` : "cancelled the scheduled close of online payments",
    detail: closeAt ? "Every Paystack payment page and product will stop taking payments at that time." : "Online payments stay open until someone closes them.",
  });
}

/**
 * Carries out a scheduled close once its time has come. Called by the scheduler every minute
 * and by every open Payments or Tickets screen, so it happens even if one of them is down.
 * The first caller claims the close; the rest do nothing. Never throws.
 */
export async function closeCheckoutsIfDue(): Promise<boolean> {
  if (!isPaystackConfigured()) return false;
  try {
    const [{ state, saved }, settings] = await Promise.all([readState(), getSettings()]);
    if (state.closed_at) return false;
    const { closeAt } = resolveCloseAt(state, saved, settings.event.starts_at);
    if (!closeAt || Date.parse(closeAt) > Date.now()) return false;

    // Claim this attempt: only the caller whose insert creates the claim row goes on
    // (insert-if-absent, as the Paystack import uses to keep each payment to one sale).
    const attempts = (state.attempts ?? 0) + 1;
    const now = new Date().toISOString();
    const claim = await createAdminClient().from("app_settings")
      .upsert({ key: `${STATE_KEY}_claim:${state.round ?? "default"}:${closeAt}:${attempts}`, value: { claimed_at: now }, updated_at: now }, { onConflict: "key", ignoreDuplicates: true })
      .select("key");
    if (claim.error) console.error("[checkout] could not claim the scheduled close:", claim.error.message);
    if (claim.error || !claim.data?.length) return false;
    const claimed: State = { ...state, close_at: closeAt, closed_at: now, attempts };
    await writeState(claimed);

    const stock = { ...(state.stock ?? {}) };
    const result = await applyOpen(false, stock);
    if (result.failed.length && attempts < 5) {
      // Let the next minute try again.
      await writeState({ ...claimed, stock, closed_at: null, attempts });
      return false;
    }
    await writeState({ ...claimed, stock });
    await recordEvent({
      actor: null, action: "paystack.checkouts_closed", category: "tickets", link: "/payments", importance: "high", tone: result.failed.length ? "critical" : "warning", audience: "managers",
      summary: result.failed.length ? "Online payments could not all be closed on schedule" : "Online payments closed on schedule",
      detail: [
        `Scheduled for ${formatDateTime(closeAt)}.`,
        result.changed.length ? `Closed: ${result.changed.map(priced).join(", ")}.` : "Everything was already closed.",
        result.failed.length ? `Still open: ${result.failed.map(priced).join(", ")}. Close ${result.failed.length === 1 ? "it" : "them"} in the Paystack dashboard now.` : null,
      ].filter(Boolean).join(" "),
    });
    return true;
  } catch (error) {
    console.error("[checkout] scheduled close failed:", error);
    return false;
  }
}
