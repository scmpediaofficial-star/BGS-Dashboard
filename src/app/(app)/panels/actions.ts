"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { PANELIST_STATUS } from "@/lib/domain";
import { recordEvent } from "@/lib/events";
import { truncate } from "@/lib/utils";

const statuses = ["proposed", "submitted", "confirmed", "declined"] as const;
const schema = z.object({ id: f.optionalId, panel_id: f.id, full_name: f.text(160), job_title: f.optionalText(200), organization: f.optionalText(200),
  status: z.enum(statuses), email: f.optionalEmail, phone: f.optionalText(60), photo_url: f.optionalUrl, bio: f.optionalText(5000), citation: f.optionalText(3000),
  photo_received: z.boolean().default(false), bio_received: z.boolean().default(false), artwork_done: z.boolean().default(false), citation_done: z.boolean().default(false), notes: f.optionalText(3000) });

export async function savePanelist(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const data = schema.parse(input);
    const values = { panel_id: data.panel_id, full_name: data.full_name, job_title: data.job_title ?? null, organization: data.organization ?? null,
      status: data.status, email: data.email ?? null, phone: data.phone ?? null, photo_url: data.photo_url ?? null, bio: data.bio ?? null,
      citation: data.citation ?? null, photo_received: data.photo_received, bio_received: data.bio_received, artwork_done: data.artwork_done,
      citation_done: data.citation_done, notes: data.notes ?? null, updated_by: profile.id };
    let id = data.id;
    if (id) {
      one(await supabase.from("panelists").select("id").eq("id", id).single());
      check(await supabase.from("panelists").update(values).eq("id", id));
    } else {
      id = one(await supabase.from("panelists").insert({ ...values, sort_order: Math.floor(Date.now() / 1000) }).select("id").single()).id;
    }
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: data.id ? "panelist.updated" : "panelist.created", category: "programme",
      summary: `${data.id ? "updated" : "added"} speaker “${truncate(data.full_name, 80)}”`, entity: { type: "panelist", id, label: data.full_name }, link: `/panels?item=${id}`, importance: "low" });
    revalidatePath("/", "layout");
    return { id };
  });
}

export async function setPanelistStatus(id: string, status: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const data = z.object({ id: f.id, status: z.enum(statuses) }).parse({ id, status });
    const before = one(await supabase.from("panelists").select("full_name, status").eq("id", data.id).single());
    if (before.status === data.status) return undefined;
    check(await supabase.from("panelists").update({ status: data.status, updated_by: profile.id }).eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "panelist.status_changed", category: "programme",
      summary: data.status === "confirmed" ? `confirmed “${before.full_name}” as a speaker` : `moved “${before.full_name}” to ${PANELIST_STATUS[data.status].label}`,
      entity: { type: "panelist", id, label: before.full_name }, link: `/panels?item=${id}`,
      importance: ["confirmed", "declined"].includes(data.status) ? "high" : "normal", tone: data.status === "confirmed" ? "good" : data.status === "declined" ? "critical" : "default" });
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function deletePanelist(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.delete");
    const row = one(await supabase.from("panelists").select("full_name").eq("id", f.id.parse(id)).single());
    check(await supabase.from("panelists").delete().eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "panelist.deleted", category: "programme", summary: `removed speaker “${row.full_name}”`, link: "/panels", audience: "managers", tone: "warning" });
    revalidatePath("/", "layout");
    return undefined;
  });
}

const panelSchema = z.object({ id: f.optionalId, number: z.coerce.number().int().min(1).max(100), title: f.text(300), perspective: f.optionalText(1000), moderator: f.optionalText(160),
  starts_at: z.preprocess((v) => v === "" ? null : v, z.iso.datetime().nullable().optional()), duration_minutes: f.optionalInt, notes: f.optionalText(3000) });
export async function savePanel(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const data = panelSchema.parse(input);
    const values = { number: data.number, title: data.title, perspective: data.perspective ?? null, moderator: data.moderator ?? null,
      starts_at: data.starts_at ?? null, duration_minutes: data.duration_minutes ?? null, notes: data.notes ?? null };
    let id = data.id;
    if (id) { one(await supabase.from("panels").select("id").eq("id", id).single()); check(await supabase.from("panels").update(values).eq("id", id)); }
    else id = one(await supabase.from("panels").insert(values).select("id").single()).id;
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: data.id ? "panel.updated" : "panel.created", category: "programme",
      summary: `${data.id ? "updated" : "added"} Panel ${data.number}: “${truncate(data.title, 80)}”`, entity: { type: "panel", id, label: data.title }, link: `/panels?group=${id}`, importance: "normal" });
    revalidatePath("/", "layout"); return { id };
  });
}

const questionSchema = z.object({ id: f.optionalId, panel_id: f.id, question: f.text(1500), sort_order: z.coerce.number().int().min(0).max(10000) });
export async function saveQuestion(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const data = questionSchema.parse(input);
    let id = data.id;
    if (id) { one(await supabase.from("panel_questions").select("id").eq("id", id).single()); check(await supabase.from("panel_questions").update({ question: data.question, sort_order: data.sort_order }).eq("id", id)); }
    else id = one(await supabase.from("panel_questions").insert({ panel_id: data.panel_id, question: data.question, sort_order: data.sort_order }).select("id").single()).id;
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: data.id ? "panel.question_updated" : "panel.question_added", category: "programme",
      summary: `${data.id ? "updated" : "added"} a panel question`, detail: truncate(data.question, 160), link: `/panels?group=${data.panel_id}`, importance: "low" });
    revalidatePath("/", "layout"); return { id };
  });
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.delete");
    const row = one(await supabase.from("panel_questions").select("panel_id, question").eq("id", f.id.parse(id)).single());
    check(await supabase.from("panel_questions").delete().eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "panel.question_deleted", category: "programme", summary: `removed a panel question`, detail: truncate(row.question, 160), link: `/panels?group=${row.panel_id}`, importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  });
}
