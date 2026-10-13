import type { Metadata } from "next";
import { InstitutionsView } from "@/components/institutions/institutions-view";
import type { Institution, MemberSale } from "@/components/institutions/types";
import { requireSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Institutions" };

export default async function InstitutionsPage({ searchParams }: PageProps<"/institutions">) {
  const { supabase } = await requireSession();
  const params = await searchParams;
  const openId = typeof params.item === "string" ? params.item : null;
  const [institutions, sales, tickets, settings] = await Promise.all([
    supabase.from("institutions").select("id, name, short_name, logo_url, signatory_name, signatory_title, signatory_signature_url, contact_person, email, phone, fee, notes, created_at").order("name"),
    // Everything paid outside Paystack: members of an institution, and sales nobody has tagged yet.
    supabase.from("ticket_sales").select("id, buyer_name, buyer_email, buyer_phone, organization, amount, currency, quantity, channel, payment_status, paystack_customer_code, institution_id, sold_at").is("paystack_id", null).order("sold_at", { ascending: false }),
    supabase.from("tickets").select("sale_id, code").not("sale_id", "is", null).neq("status", "void").order("seq"),
  getSettings(),
  ]);
  const codes = new Map<string, string[]>();
  for (const t of tickets.data ?? []) codes.set(t.sale_id!, [...(codes.get(t.sale_id!) ?? []), t.code]);
  const members: MemberSale[] = (sales.data ?? []).map((s) => ({ ...s, codes: codes.get(s.id) ?? [] }));
  return <InstitutionsView institutions={(institutions.data ?? []) as Institution[]} sales={members} openId={openId} directPrice={settings.tickets.direct_price} />;
}
