import type { Metadata } from "next";
import { TicketsView } from "@/components/tickets/tickets-view";
import { requireSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Tickets & access" };

export default async function TicketsPage() {
  const { supabase } = await requireSession();
  const [types, sales, settings] = await Promise.all([
    supabase.from("ticket_types").select("id, name, price, currency, is_virtual, is_active").order("sort_order"),
    supabase.from("ticket_sales").select("id, ticket_type_id, buyer_name, buyer_email, buyer_phone, organization, country, quantity, amount, currency, channel, payment_status, reference, sold_at, access_code, access_sent_at, notes, ticket_type:ticket_types(name, is_virtual)").order("sold_at", { ascending: false }),
    getSettings(),
  ]);
  return <TicketsView ticketTypes={types.data ?? []} sales={sales.data ?? []} virtual={settings.virtual} targets={settings.targets} />;
}
