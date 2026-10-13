import type { Metadata } from "next";
import { CertificatesPanel } from "@/components/certificates/certificates-panel";
import type { CertInstitution, CertSale, CertTicket } from "@/components/certificates/types";
import { certificateEvent } from "@/lib/attendance";
import { requireSession, type Session } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Certificates" };

/** Every paid ticket, read a page at a time: the API returns at most 1,000 rows per request. */
async function loadTickets(supabase: Session["supabase"]): Promise<CertTicket[]> {
  const rows: CertTicket[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("tickets").select("id, code, kind, status, holder_name, organization, sale_id, institution_id").eq("kind", "paid").neq("status", "void").order("seq").range(from, from + 999);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function loadSales(supabase: Session["supabase"]): Promise<CertSale[]> {
  const rows: CertSale[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("ticket_sales").select("id, organization, institution_id").order("sold_at").range(from, from + 999);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export default async function CertificatesPage() {
  const { supabase } = await requireSession();
  const [tickets, sales, institutions, settings] = await Promise.all([
    loadTickets(supabase),
    loadSales(supabase),
    supabase.from("institutions").select("id, name, short_name, logo_url, signatory_name, signatory_title, signatory_signature_url").order("name"),
    getSettings(),
  ]);
  return (
    <>
      <PageHeader eyebrow="Commercial" title="Certificates" description="A certificate of attendance for everyone who has paid, drawn from their ticket. Members of an institution carry its logo top right." />
      <CertificatesPanel tickets={tickets} sales={sales} institutions={(institutions.data ?? []) as CertInstitution[]} event={certificateEvent(settings.event)} />
    </>
  );
}
