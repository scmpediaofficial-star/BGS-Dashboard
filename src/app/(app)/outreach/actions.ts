"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { OUTREACH_STATUS } from "@/lib/domain";
import { recordEvent } from "@/lib/events";
import { isoDay, truncate } from "@/lib/utils";

const statuses = ["pending", "submitted", "acknowledged", "confirmed", "declined"] as const;
const schema = z.object({ id: f.optionalId, list: z.enum(["letters", "embassies"]), category: f.text(100), name: f.text(220), status: z.enum(statuses),
  contact_person: f.optionalText(160), email: f.optionalEmail, phone: f.optionalText(60), notes: f.optionalText(3000), submitted_on: f.optionalDate, follow_up_on: f.optionalDate });

export async function saveContact(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const data = schema.parse(input);
    const values = { list: data.list, category: data.category, name: data.name, status: data.status, contact_person: data.contact_person ?? null,
      email: data.email ?? null, phone: data.phone ?? null, notes: data.notes ?? null,
      submitted_on: data.submitted_on ?? (data.status === "submitted" ? isoDay() : null), follow_up_on: data.follow_up_on ?? null, updated_by: profile.id };
    let id = data.id;
    if (id) { one(await supabase.from("outreach_contacts").select("id").eq("id", id).single()); check(await supabase.from("outreach_contacts").update(values).eq("id", id)); }
    else id = one(await supabase.from("outreach_contacts").insert({ ...values, sort_order: Math.floor(Date.now() / 1000) }).select("id").single()).id;
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: data.id ? "outreach.updated" : "outreach.created", category: "outreach",
      summary: `${data.id ? "updated" : "added"} outreach for “${truncate(data.name, 80)}”`, entity: { type: "outreach", id, label: data.name }, link: `/outreach?item=${id}`, importance: "low" });
    revalidatePath("/", "layout"); return { id };
  });
}

export async function setContactStatus(id: string, status: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const input = z.object({ id: f.id, status: z.enum(statuses) }).parse({ id, status });
    const before = one(await supabase.from("outreach_contacts").select("name, status, submitted_on").eq("id", input.id).single());
    if (before.status === input.status) return undefined;
    check(await supabase.from("outreach_contacts").update({ status: input.status, updated_by: profile.id,
      submitted_on: input.status === "submitted" && !before.submitted_on ? isoDay() : before.submitted_on }).eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "outreach.status_changed", category: "outreach",
      summary: `moved “${before.name}” to ${OUTREACH_STATUS[input.status].label}`, entity: { type: "outreach", id, label: before.name }, link: `/outreach?item=${id}`,
      importance: ["confirmed", "declined"].includes(input.status) ? "high" : "normal", tone: input.status === "confirmed" ? "good" : input.status === "declined" ? "critical" : "default" });
    revalidatePath("/", "layout"); return undefined;
  });
}

export async function deleteContact(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.delete");
    const row = one(await supabase.from("outreach_contacts").select("name").eq("id", f.id.parse(id)).single());
    check(await supabase.from("outreach_contacts").delete().eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "outreach.deleted", category: "outreach", summary: `removed “${row.name}” from outreach`, link: "/outreach", audience: "managers", tone: "warning" });
    revalidatePath("/", "layout"); return undefined;
  });
}
