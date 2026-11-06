"use server";

import { z } from "zod";
import { ActionError, f, run, type ActionResult } from "@/lib/actions";
import { ticketEvent } from "@/lib/attendance";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Where a student collects their complimentary ticket, signed out.
 *
 * Row-level security hides tickets from the public, so these actions use the
 * service client — and therefore do only three things, each keyed on the
 * ticket's unique code (31^8 possibilities, so it cannot be guessed): read that
 * one ticket, fill in the details that are still missing, and count a download.
 * Nothing here ever returns another student's data.
 */

export type StudentTicketView = {
  code: string; name: string; studentNumber: string | null; institutionName: string; logoUrl: string | null;
  programme: string | null; email: string | null; phone: string | null; complete: boolean;
  event: { dateLine: string; venueLine: string; admitLabel: string };
};

/** "bgs k7qm 4xwp", "K7QM4XWP" and "BGS-K7QM-4XWP" are all the same code. */
function normaliseCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.startsWith("BGS") && raw.length === 11 ? raw.slice(3) : raw;
  return /^[A-HJKMNP-Z2-9]{8}$/.test(body) ? `BGS-${body.slice(0, 4)}-${body.slice(4)}` : null;
}
const codeSchema = z.string().trim().max(40).transform((v, ctx) => {
  const code = normaliseCode(v);
  if (!code) ctx.addIssue({ code: "custom", message: "That doesn't look like a ticket code. It reads like BGS-K7QM-4XWP." });
  return code ?? "";
});

const COLUMNS = "id, code, status, holder_name, holder_email, holder_phone, programme, student_number, organization, details_completed_at, download_count, institution:institutions(name, logo_url)";

async function findTicket(code: string) {
  const { data } = await createAdminClient().from("tickets").select(COLUMNS).eq("code", code).eq("kind", "student").maybeSingle();
  if (!data) throw new ActionError("We couldn't find a student ticket with that code. Check it and try again.");
  if (data.status === "void") throw new ActionError("This ticket is no longer valid. Please contact the summit team.");
  return data;
}

async function view(row: NonNullable<Awaited<ReturnType<typeof findTicket>>>): Promise<StudentTicketView> {
  const settings = await getSettings();
  return {
    code: row.code, name: row.holder_name ?? "Student", studentNumber: row.student_number, institutionName: row.institution?.name ?? row.organization ?? "",
    logoUrl: row.institution?.logo_url ?? null, programme: row.programme, email: row.holder_email, phone: row.holder_phone,
    complete: !!(row.programme && row.holder_email && row.holder_phone), event: ticketEvent(settings.event, settings.tickets),
  };
}

const log = (row: { id: string; holder_name: string | null }, action: string, summary: string) =>
  createAdminClient().from("activity_log").insert({ actor_name: row.holder_name ?? "A student", action, category: "tickets", entity_type: "ticket", entity_id: row.id, entity_label: row.holder_name, summary, link: `/tickets?tab=students&student=${row.id}` });

export async function lookupStudentTicket(input: { code: string }): Promise<ActionResult<StudentTicketView>> {
  return run(async () => view(await findTicket(codeSchema.parse(input.code))));
}

const detailsSchema = z.object({ code: codeSchema, programme: f.optionalText(160), email: z.preprocess((v) => (typeof v === "string" && !v.trim() ? null : v), f.email.nullable().optional()),
  phone: f.optionalText(60) });

/** Fills in what the team did not already know. Details the team entered are never overwritten from this page. */
export async function completeStudentDetails(input: { code: string; programme?: string; email?: string; phone?: string }): Promise<ActionResult<StudentTicketView>> {
  return run(async () => {
    const data = detailsSchema.parse(input);
    const row = await findTicket(data.code);
    const next = { programme: row.programme || data.programme || null, holder_email: row.holder_email || data.email || null, holder_phone: row.holder_phone || data.phone || null };
    if (!next.programme) throw new ActionError("Enter your programme of study.");
    if (!next.holder_email) throw new ActionError("Enter your email address.");
    if (!next.holder_phone) throw new ActionError("Enter your phone number.");
    if (!/^\+?[\d\s()-]{7,20}$/.test(next.holder_phone) || next.holder_phone.replace(/\D/g, "").length < 7) throw new ActionError("Enter a valid phone number, like 024 123 4567.");

    const { error } = await createAdminClient().from("tickets").update({ ...next, details_completed_at: row.details_completed_at ?? new Date().toISOString() }).eq("id", row.id);
    if (error) { console.error("[student-ticket] update failed:", error.message); throw new ActionError("We couldn't save your details. Please try again."); }
    if (!row.details_completed_at) await log(row, "student.details_completed", `completed their student ticket details${next.programme ? ` (${next.programme})` : ""}`);
    return view({ ...row, ...next, details_completed_at: row.details_completed_at ?? "now" });
  }, "Details saved");
}

/** Counts a download so the team can see who has collected their ticket. Only a student with complete details can download. */
export async function recordStudentDownload(input: { code: string }): Promise<ActionResult> {
  return run(async () => {
    const row = await findTicket(codeSchema.parse(input.code));
    if (!(row.programme && row.holder_email && row.holder_phone)) throw new ActionError("Add your details first.");
    const { error } = await createAdminClient().from("tickets").update({ download_count: row.download_count + 1, ...(row.download_count === 0 ? { first_downloaded_at: new Date().toISOString() } : {}) }).eq("id", row.id);
    if (error) console.error("[student-ticket] download count failed:", error.message);
    if (row.download_count === 0) await log(row, "student.ticket_downloaded", "downloaded their student ticket");
    return undefined;
  });
}
