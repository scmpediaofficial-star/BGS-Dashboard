import type { Metadata } from "next";
import { TicketsView } from "@/components/tickets/tickets-view";
import type { Sale, TicketRow } from "@/components/tickets/types";
import { getAttendance, moderatorName } from "@/lib/attendance";
import { requireSession, type Session } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { EVENT_TZ } from "@/lib/utils";

export const metadata: Metadata = { title: "Tickets & access" };

const TICKET_COLUMNS = "id, seq, code, kind, status, holder_name, holder_email, holder_phone, organization, role_label, sale_id, panelist_id, notes, checked_in_at, created_at";

/** Every ticket, read a page at a time: the API returns at most 1,000 rows per request. */
async function loadTickets(supabase: Session["supabase"]): Promise<TicketRow[]> {
  const rows: TicketRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("tickets").select(TICKET_COLUMNS).order("seq").range(from, from + 999);
    rows.push(...((data ?? []) as TicketRow[]));
    if (!data || data.length < 1000) return rows;
  }
}

export default async function TicketsPage() {
  const { supabase } = await requireSession();
  const [types, sales, tickets, attendance, panelists, panels, settings] = await Promise.all([
    supabase.from("ticket_types").select("id, name, price, currency, is_virtual, is_active").order("sort_order"),
    supabase.from("ticket_sales").select("id, ticket_type_id, buyer_name, buyer_email, buyer_phone, organization, country, quantity, amount, currency, channel, payment_status, reference, sold_at, access_code, access_sent_at, notes, paystack_id, paystack_customer_code, ticket_type:ticket_types(name, is_virtual)").order("sold_at", { ascending: false }),
    loadTickets(supabase),
    getAttendance(supabase),
    supabase.from("panelists").select("id, full_name").eq("status", "confirmed"),
    supabase.from("panels").select("moderator"),
    getSettings(),
  ]);

  // People on the programme who have no delegate ticket yet (matched by panelist, then by name).
  const delegates = tickets.filter((t) => t.kind === "delegate" && t.status !== "void");
  const ticketed = new Set(delegates.map((t) => t.panelist_id).filter(Boolean));
  const names = new Set(delegates.map((t) => t.holder_name?.trim().toLowerCase()).filter(Boolean));
  const waiting = new Set<string>();
  for (const p of panelists.data ?? []) if (!ticketed.has(p.id) && !names.has(p.full_name.trim().toLowerCase())) waiting.add(p.full_name.trim().toLowerCase());
  for (const p of panels.data ?? []) {
    const moderator = moderatorName(p.moderator)?.toLowerCase();
    if (moderator && !names.has(moderator)) waiting.add(moderator);
  }

  const { event } = settings;
  const ticketEvent = {
    dateLine: new Intl.DateTimeFormat("en-GB", { timeZone: EVENT_TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(event.starts_at)),
    venueLine: `${event.venue}, ${event.city}`,
  };

  return (
    <TicketsView
      ticketTypes={types.data ?? []}
      sales={(sales.data ?? []) as Sale[]}
      tickets={tickets}
      attendance={attendance}
      programmePending={waiting.size}
      event={ticketEvent}
      virtual={settings.virtual}
      targets={settings.targets}
    />
  );
}
