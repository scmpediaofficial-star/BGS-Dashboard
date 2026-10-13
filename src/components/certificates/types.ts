import type { CertificateFace } from "@/components/certificates/certificate-art";


export type CertTicket = { id: string; code: string; kind: string; status: string; holder_name: string | null; organization: string | null; sale_id: string | null; institution_id: string | null };
export type CertSale = { id: string; organization: string | null; institution_id: string | null };
export type CertInstitution = { id: string; name: string; short_name: string | null; logo_url: string | null };

/** How a certificate came to carry an institution's logo. */
export type LabelSource = "ticket" | "payment" | "organisation";

export type CertificateRow = {
  id: string; code: string; name: string; organization: string | null; checkedIn: boolean;
  institution: CertInstitution | null; source: LabelSource | null;
};

const squash = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * A certificate for everyone holding a paid ticket with a name on it. The label is the first that applies:
 *   1. the institution the ticket was tied to by hand,
 *   2. the institution that paid for the member,
 *   3. an institution whose name or short name is what the person wrote as their organisation.
 */
export function certificateRows(tickets: CertTicket[], sales: CertSale[], institutions: CertInstitution[]): CertificateRow[] {
  const saleBy = new Map(sales.map((s) => [s.id, s]));
  const byId = new Map(institutions.map((i) => [i.id, i]));
  const byName = new Map<string, CertInstitution>();
  for (const i of institutions) for (const key of [squash(i.name), squash(i.short_name)]) if (key) byName.set(key, i);

  const rows: CertificateRow[] = [];
  for (const t of tickets) {
    const name = (t.holder_name ?? "").replace(/\s+/g, " ").trim();
    if (t.kind !== "paid" || t.status === "void" || !name) continue;
    const sale = t.sale_id ? saleBy.get(t.sale_id) : undefined;
    const direct = t.institution_id ? byId.get(t.institution_id) : undefined;
    const payer = sale?.institution_id ? byId.get(sale.institution_id) : undefined;
    const typed = byName.get(squash(t.organization ?? sale?.organization));
    const institution = direct ?? payer ?? typed ?? null;
    rows.push({
      id: t.id, code: t.code, name, organization: t.organization ?? sale?.organization ?? null, checkedIn: t.status === "checked_in",
      institution, source: direct ? "ticket" : payer ? "payment" : typed ? "organisation" : null,
    });
  }
  return rows;
}

export const toCertificateFace = (row: Pick<CertificateRow, "code" | "name" | "institution">): CertificateFace => ({
  code: row.code, name: row.name, institution: row.institution ? { name: row.institution.name, logoUrl: row.institution.logo_url } : null,
});
