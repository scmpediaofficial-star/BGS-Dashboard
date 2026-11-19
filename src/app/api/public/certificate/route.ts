import { certificateRows, toCertificateFace, type CertInstitution } from "@/components/certificates/types";
import { certificateEvent } from "@/lib/attendance";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Certificate verification for boardroomgovsummit.com/certificates/. Public on purpose.
 *
 * Row-level security hides tickets from the public, so this uses the service client and, like the
 * student-ticket page, is keyed only on the certificate number — the ticket code, 31^8 possibilities,
 * so it cannot be guessed. It answers with what is printed on that one certificate and nothing else:
 * never an email, a phone number or anyone else's data. The labelling rules are the Certificates
 * module's own (`certificateRows`), so the website shows exactly the certificate the team issues.
 *
 *   200 { status: "valid", certificate, event }
 *   400 { status: "invalid" }      not shaped like a code
 *   404 { status: "not_found" }    no certificate under this number (unknown, unnamed, or not a paid ticket)
 *   410 { status: "withdrawn" }    the ticket was voided
 *   503 { status: "error" }
 */

const HEADERS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
const reply = (body: object, status = 200) => Response.json(body, { status, headers: HEADERS });

/** "bgs k7qm 4xwp", "K7QM4XWP" and "BGS-K7QM-4XWP" are all the same code. */
function normaliseCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.startsWith("BGS") && raw.length === 11 ? raw.slice(3) : raw;
  return /^[A-HJKMNP-Z2-9]{8}$/.test(body) ? `BGS-${body.slice(0, 4)}-${body.slice(4)}` : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = normaliseCode((url.searchParams.get("code") ?? "").slice(0, 40));
  if (!code) return reply({ status: "invalid" }, 400);

  try {
    const admin = createAdminClient();
    const { data: ticket, error } = await admin.from("tickets")
      .select("id, code, kind, status, holder_name, organization, sale_id, institution_id").eq("code", code).maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket || ticket.kind !== "paid") return reply({ status: "not_found", code }, 404);
    if (ticket.status === "void") return reply({ status: "withdrawn", code }, 410);

    const [sale, institutions, settings] = await Promise.all([
      ticket.sale_id ? admin.from("ticket_sales").select("id, organization, institution_id").eq("id", ticket.sale_id).maybeSingle() : null,
      admin.from("institutions").select("id, name, short_name, logo_url, signatory_name, signatory_title, signatory_signature_url"),
      getSettings(),
    ]);
    if (institutions.error) throw new Error(institutions.error.message);
    const [row] = certificateRows([ticket], sale?.data ? [sale.data] : [], (institutions.data ?? []) as CertInstitution[]);
    if (!row) return reply({ status: "not_found", code }, 404);

    // Logos bundled with the dashboard are stored as "/brand/…"; the website needs the full address.
    const absolute = (value: string | null) => (value?.startsWith("/") ? new URL(value, url.origin).href : value);
    const face = toCertificateFace(row);
    if (face.institution) {
      face.institution.logoUrl = absolute(face.institution.logoUrl);
      if (face.institution.signatory) face.institution.signatory.signatureUrl = absolute(face.institution.signatory.signatureUrl);
    }
    return reply({ status: "valid", certificate: face, event: certificateEvent(settings.event) });
  } catch (error) {
    console.error("[certificate-verify]", error instanceof Error ? error.message : error);
    return reply({ status: "error" }, 503);
  }
}
