"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { recordEvent } from "@/lib/events";
import { parseStudentList } from "@/lib/student-list";
import { pluralize, truncate } from "@/lib/utils";

/**
 * Complimentary student tickets. A student is an ordinary ticket of kind
 * 'student', tied to an institution (its name and logo go on the e-ticket).
 * Students collect the ticket themselves on /student-ticket with its code;
 * here the team adds them, corrects them and sees who is still outstanding.
 * Voiding, checking in and deleting use the shared ticket actions.
 */

const studentSchema = z.object({
  id: f.optionalId, institution_id: f.id, holder_name: f.text(160), student_number: f.text(40),
  programme: f.optionalText(160), holder_email: f.optionalEmail, holder_phone: f.optionalText(60), notes: f.optionalText(2000),
});

/** All three details a student must give before the ticket can be downloaded. */
const complete = (v: { programme?: string | null; holder_email?: string | null; holder_phone?: string | null }) => !!(v.programme && v.holder_email && v.holder_phone);

export async function saveStudent(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const data = studentSchema.parse(input);
    const institution = one(await supabase.from("institutions").select("id, name").eq("id", data.institution_id).single());
    const values = {
      holder_name: data.holder_name, student_number: data.student_number, institution_id: institution.id, organization: institution.name,
      programme: data.programme ?? null, holder_email: data.holder_email ?? null, holder_phone: data.holder_phone ?? null, notes: data.notes ?? null,
    };

    // A student number is on one live ticket per institution; say who has it rather than a bare "already exists".
    const clash = await supabase.from("tickets").select("id, holder_name").eq("kind", "student").eq("institution_id", institution.id).neq("status", "void").ilike("student_number", data.student_number.replace(/[\\%_]/g, "\\$&"));
    const other = (check(clash) ?? []).find((t) => t.id !== data.id);
    if (other) throw new ActionError(`Student number ${data.student_number} already has a ticket${other.holder_name ? ` (${other.holder_name})` : ""}.`);

    if (data.id) {
      const before = one(await supabase.from("tickets").select("id, code, kind, details_completed_at").eq("id", data.id).single());
      if (before.kind !== "student") throw new ActionError("That isn't a student ticket.");
      const stamp = complete(values) ? before.details_completed_at ?? new Date().toISOString() : null;
      check(await supabase.from("tickets").update({ ...values, details_completed_at: stamp }).eq("id", data.id));
      await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "student.updated", category: "tickets",
        summary: `updated student ticket ${before.code} for “${truncate(values.holder_name, 80)}”`,
        entity: { type: "ticket", id: before.id, label: values.holder_name }, link: `/tickets?tab=students&student=${before.id}`, importance: "low" });
      revalidatePath("/", "layout"); return { id: before.id };
    }

    const row = one(await supabase.from("tickets").insert({ ...values, kind: "student", issued_by: profile.id, details_completed_at: complete(values) ? new Date().toISOString() : null }).select("id, code").single());
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "student.added", category: "tickets",
      summary: `issued a complimentary student ticket to “${truncate(values.holder_name, 80)}”`, entity: { type: "ticket", id: row.id, label: values.holder_name },
      link: `/tickets?tab=students&student=${row.id}`, facts: [{ label: "Ticket no.", value: row.code }, { label: "Student no.", value: values.student_number }, { label: "Institution", value: institution.name }] });
    revalidatePath("/", "layout"); return { id: row.id };
  });
}

/**
 * Issues one student ticket per line of a pasted list. The list is read again
 * here (the form's preview is only a courtesy); students who already hold a
 * live ticket at this institution are skipped, never doubled.
 */
export async function importStudents(input: { institution_id: string; text: string }): Promise<ActionResult<{ added: number; skipped: string[]; problems: number }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("tickets.manage");
    const data = z.object({ institution_id: f.id, text: z.string().max(60_000, "That list is too long.") }).parse(input);
    const institution = one(await supabase.from("institutions").select("id, name").eq("id", data.institution_id).single());
    const { rows, problems } = parseStudentList(data.text);
    if (!rows.length) throw new ActionError(problems.length ? "No student could be read from that list. Each line needs a name and a student number." : "Paste the list first.");

    const existing = check(await supabase.from("tickets").select("student_number").eq("kind", "student").eq("institution_id", institution.id).neq("status", "void")) ?? [];
    const taken = new Set(existing.map((t) => (t.student_number ?? "").toLowerCase()));
    const fresh = rows.filter((r) => !taken.has(r.number.toLowerCase()));
    const skipped = rows.filter((r) => taken.has(r.number.toLowerCase())).map((r) => r.name);

    for (let i = 0; i < fresh.length; i += 200) {
      check(await supabase.from("tickets").insert(fresh.slice(i, i + 200).map((r) => ({
        kind: "student", holder_name: r.name, student_number: r.number, institution_id: institution.id, organization: institution.name, issued_by: profile.id,
      }))));
    }
    if (fresh.length) {
      await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "student.imported", category: "tickets",
        summary: `issued ${pluralize(fresh.length, "complimentary student ticket")} for “${truncate(institution.name, 80)}”`, detail: truncate(fresh.map((r) => r.name).join(", "), 240),
        link: "/tickets?tab=students", importance: "high" });
      revalidatePath("/", "layout");
    }
    return { added: fresh.length, skipped, problems: problems.length };
  });
}
