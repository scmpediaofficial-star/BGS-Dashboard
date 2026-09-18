"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { ACTION_STATUS } from "@/lib/domain";
import { recordEvent } from "@/lib/events";
import { formatDateTime, truncate } from "@/lib/utils";
import type { Json } from "@/types/database";

const actionStatuses = ["open", "in_progress", "done"] as const;
const actionSchema = z.object({ id: f.optionalId, meeting_id: f.optionalId, title: f.text(300), owner_label: f.optionalText(160), assignee_id: f.optionalId,
  due_date: f.optionalDate, due_label: f.optionalText(100), status: z.enum(actionStatuses), notes: f.optionalText(3000) });

export async function saveActionItem(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const data = actionSchema.parse(input);
    const values = { meeting_id: data.meeting_id ?? null, title: data.title, owner_label: data.owner_label ?? null, assignee_id: data.assignee_id ?? null,
      due_date: data.due_date ?? null, due_label: data.due_label ?? null, status: data.status, notes: data.notes ?? null, updated_by: profile.id };
    let id = data.id;
    if (id) { one(await supabase.from("action_items").select("id").eq("id", id).single()); check(await supabase.from("action_items").update(values).eq("id", id)); }
    else id = one(await supabase.from("action_items").insert({ ...values, sort_order: Math.floor(Date.now() / 1000) }).select("id").single()).id;
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: data.id ? "action.updated" : "action.created", category: "meetings",
      summary: `${data.id ? "updated" : "added"} action “${truncate(data.title, 80)}”`, entity: { type: "action_item", id, label: data.title },
      link: `/meetings?item=${id}`, include: [data.assignee_id], importance: data.assignee_id ? "high" : "normal" });
    revalidatePath("/", "layout"); return { id };
  });
}

export async function setActionItemStatus(id: string, status: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const input = z.object({ id: f.id, status: z.enum(actionStatuses) }).parse({ id, status });
    const before = one(await supabase.from("action_items").select("title, status, assignee_id").eq("id", input.id).single());
    if (before.status === input.status) return undefined;
    check(await supabase.from("action_items").update({ status: input.status, updated_by: profile.id }).eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "action.status_changed", category: "meetings",
      summary: input.status === "done" ? `completed action “${before.title}”` : `moved action “${before.title}” to ${ACTION_STATUS[input.status].label}`,
      entity: { type: "action_item", id, label: before.title }, link: `/meetings?item=${id}`, include: [before.assignee_id], importance: input.status === "done" ? "high" : "normal", tone: input.status === "done" ? "good" : "default" });
    revalidatePath("/", "layout"); return undefined;
  });
}

export async function deleteActionItem(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.delete");
    const row = one(await supabase.from("action_items").select("title").eq("id", f.id.parse(id)).single());
    check(await supabase.from("action_items").delete().eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "action.deleted", category: "meetings", summary: `removed action “${row.title}”`, link: "/meetings", audience: "managers", tone: "warning" });
    revalidatePath("/", "layout"); return undefined;
  });
}

const sectionSchema = z.object({ heading: f.text(160), points: z.array(f.text(2000)).max(40), actions: z.array(f.text(300)).max(40) });
const meetingSchema = z.object({ id: f.optionalId, title: f.text(220), meeting_at: z.iso.datetime(), venue: f.optionalText(200),
  mode: z.enum(["in_person", "virtual", "hybrid"]), status: z.enum(["scheduled", "held", "cancelled"]), join_url: f.optionalUrl,
  attendees: z.array(f.text(160)).max(100), sections: z.array(sectionSchema).max(40) });

export async function saveMeeting(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const data = meetingSchema.parse(input);
    const values = { title: data.title, meeting_at: data.meeting_at, venue: data.venue ?? null, mode: data.mode, status: data.status,
      join_url: data.join_url ?? null, attendees: data.attendees as Json, sections: data.sections as Json };
    let id = data.id;
    if (id) { one(await supabase.from("meetings").select("id").eq("id", id).single()); check(await supabase.from("meetings").update(values).eq("id", id)); }
    else id = one(await supabase.from("meetings").insert({ ...values, created_by: profile.id }).select("id").single()).id;
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: data.id ? "meeting.updated" : "meeting.created", category: "meetings",
      summary: `${data.id ? "updated" : "scheduled"} “${truncate(data.title, 80)}”`, entity: { type: "meeting", id, label: data.title }, link: `/meetings?meeting=${id}`,
      importance: data.status === "held" || !data.id ? "high" : "normal", facts: [{ label: "When", value: formatDateTime(data.meeting_at) }, ...(data.venue ? [{ label: "Where", value: data.venue }] : [])] });
    revalidatePath("/", "layout"); return { id };
  });
}

export async function deleteMeeting(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.delete");
    const row = one(await supabase.from("meetings").select("title").eq("id", f.id.parse(id)).single());
    check(await supabase.from("meetings").delete().eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "meeting.deleted", category: "meetings", summary: `removed meeting “${row.title}”`, link: "/meetings", audience: "managers", tone: "warning" });
    revalidatePath("/", "layout"); return undefined;
  });
}

export async function createActionsFromMinutes(meetingId: string): Promise<ActionResult<{ count: number }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const meeting = one(await supabase.from("meetings").select("id, title, sections").eq("id", f.id.parse(meetingId)).single());
    const sections = z.array(sectionSchema).parse(meeting.sections);
    const titles = [...new Set(sections.flatMap((s) => s.actions).map((s) => s.trim()).filter(Boolean))];
    const existing = check(await supabase.from("action_items").select("title").eq("meeting_id", meetingId));
    const seen = new Set((existing ?? []).map((x) => x.title.toLowerCase()));
    const fresh = titles.filter((title) => !seen.has(title.toLowerCase()));
    if (fresh.length) check(await supabase.from("action_items").insert(fresh.map((title, index) => ({ meeting_id: meetingId, title, status: "open" as const, sort_order: index, updated_by: profile.id }))));
    if (fresh.length) await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "meeting.actions_imported", category: "meetings",
      summary: `created ${fresh.length} action points from “${meeting.title}”`, link: `/meetings?meeting=${meetingId}`, importance: "normal" });
    revalidatePath("/", "layout"); return { count: fresh.length };
  });
}
