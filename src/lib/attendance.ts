import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSettings } from "@/lib/domain";
import type { TicketSettings } from "@/lib/settings";
import { EVENT_TZ } from "@/lib/utils";
import type { Database } from "@/types/database";

/** The date and venue lines printed on every e-ticket, from the event settings. */
export function ticketEvent(event: EventSettings, tickets: Pick<TicketSettings, "admit_label">): { dateLine: string; venueLine: string; admitLabel: string } {
  return {
    admitLabel: tickets.admit_label.trim() || "Admit one",
    dateLine: new Intl.DateTimeFormat("en-GB", { timeZone: EVENT_TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(event.starts_at)),
    venueLine: `${event.venue}, ${event.city}`,
  };
}

/** What the certificate of attendance says about the summit, from the event settings. */
export function certificateEvent(event: EventSettings): { title: string; dateLine: string; venueLine: string; theme: string; convener: string } {
  return {
    title: event.name,
    dateLine: new Intl.DateTimeFormat("en-GB", { timeZone: EVENT_TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(event.starts_at)),
    venueLine: `${event.venue}, ${event.city}`,
    theme: event.theme,
    convener: event.convener,
  };
}

/**
 * The person named in a panel's free-text moderator field, or null when nobody
 * is named yet: "Mr. A. Mensah (Chairman, XYZ)" → "Mr. A. Mensah"; "To be announced" → null.
 */
export function moderatorName(value: string | null | undefined): string | null {
  const name = (value ?? "").replace(/\s*\(.*\)\s*$/, "").trim();
  return !name || /\b(tba|tbc|to be (announced|confirmed))\b/i.test(name) ? null : name;
}

export type Attendance = { paid: number; paidOnline: number; paidByInstitution: number; delegates: number; complimentary: number; complimentaryNamed: number; checkedIn: number };

/**
 * Headcount from issued tickets (void ones excluded), counted in the database
 * so it stays exact however many tickets there are.
 *   paid           people holding a paid ticket — bought online through Paystack, or paid for by an institution (or another way) outside it
 *   delegates      chairperson, panel members, moderators and other invited delegates
 *   complimentary  complimentary tickets issued (named or still blank)
 */
export async function getAttendance(supabase: SupabaseClient<Database>): Promise<Attendance> {
  const live = () => supabase.from("tickets").select("id", { count: "exact", head: true }).neq("status", "void");
  const [paid, online, delegates, complimentary, named, checkedIn] = await Promise.all([
    live().eq("kind", "paid"),
    // Paid tickets whose sale came through Paystack; the rest were paid for by institutions or another way.
    supabase.from("tickets").select("id, sale:ticket_sales!inner(paystack_id)", { count: "exact", head: true }).neq("status", "void").eq("kind", "paid").not("sale.paystack_id", "is", null),
    live().eq("kind", "delegate"),
    live().eq("kind", "complimentary"),
    live().eq("kind", "complimentary").not("holder_name", "is", null),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "checked_in"),
  ]);
  const paidCount = paid.count ?? 0;
  const paidOnline = Math.min(paidCount, online.count ?? 0);
  return {
    paid: paidCount, paidOnline, paidByInstitution: paidCount - paidOnline, delegates: delegates.count ?? 0, complimentary: complimentary.count ?? 0,
    complimentaryNamed: named.count ?? 0, checkedIn: checkedIn.count ?? 0,
  };
}
