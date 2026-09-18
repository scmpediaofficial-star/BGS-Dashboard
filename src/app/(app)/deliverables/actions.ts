"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { DELIVERABLE_STATUS, PRIORITY } from "@/lib/domain";
import { recordEvent } from "@/lib/events";
import type { Fact } from "@/lib/email/templates";
import { formatDate, truncate } from "@/lib/utils";
import type { Json } from "@/types/database";

const STATUSES = ["pending", "in_progress", "in_review", "blocked", "completed"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;

const checklistItem = z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(200), done: z.boolean() });

const schema = z.object({
  id: f.optionalId,
  title: f.text(200),
  workstream_id: f.id,
  section: f.text(80),
  quantity: f.optionalInt,
  responsibility: f.optionalText(80),
  assignee_id: f.optionalId,
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  due_date: f.optionalDate,
  comment: f.optionalText(2000),
  checklist: z.array(checklistItem).max(40).default([]),
});

export type DeliverableInput = z.input<typeof schema>;

const link = (id: string) => `/deliverables?item=${id}`;

function refresh() {
  revalidatePath("/", "layout"); // the tracker, the overview and the sidebar's overdue badge all read this table
}

export async function saveDeliverable(input: DeliverableInput): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const data = schema.parse(input);
    const actor = { id: profile.id, name: profile.full_name };
    const values = {
      title: data.title,
      workstream_id: data.workstream_id,
      section: data.section,
      quantity: data.quantity ?? null,
      responsibility: data.responsibility ?? null,
      assignee_id: data.assignee_id ?? null,
      status: data.status,
      priority: data.priority,
      due_date: data.due_date ?? null,
      comment: data.comment ?? null,
      checklist: data.checklist as unknown as Json,
      updated_by: profile.id,
    };

    // ── Create ──────────────────────────────────────────────────────────────
    if (!data.id) {
      const created = one(await supabase.from("deliverables").insert({ ...values, created_by: profile.id, sort_order: Math.floor(Date.now() / 1000) }).select("id, workstream:workstreams(name)").single());
      await recordEvent({
        actor,
        action: "deliverable.created",
        category: "deliverables",
        summary: `added “${truncate(data.title, 80)}” to ${created.workstream?.name ?? "the tracker"}`,
        entity: { type: "deliverable", id: created.id, label: data.title },
        link: link(created.id),
        include: [data.assignee_id],
        facts: [
          { label: "Section", value: data.section },
          ...(data.responsibility ? [{ label: "Owner", value: data.responsibility }] : []),
          ...(data.due_date ? [{ label: "Due", value: formatDate(data.due_date) }] : []),
        ],
      });
      refresh();
      return { id: created.id };
    }

    // ── Update: describe what actually changed ──────────────────────────────
    const before = one(await supabase.from("deliverables").select("title, status, assignee_id, due_date, priority, responsibility, section").eq("id", data.id).single());
    check(await supabase.from("deliverables").update(values).eq("id", data.id));

    const facts: Fact[] = [];
    if (before.status !== data.status) facts.push({ label: "Status", value: `${DELIVERABLE_STATUS[before.status].label} → ${DELIVERABLE_STATUS[data.status].label}` });
    if ((before.due_date ?? null) !== (data.due_date ?? null)) facts.push({ label: "Due", value: `${formatDate(before.due_date)} → ${formatDate(data.due_date)}` });
    if (before.priority !== data.priority) facts.push({ label: "Priority", value: `${PRIORITY[before.priority].label} → ${PRIORITY[data.priority].label}` });
    if ((before.responsibility ?? "") !== (data.responsibility ?? "")) facts.push({ label: "Owner", value: `${before.responsibility || "—"} → ${data.responsibility || "—"}` });

    const reassigned = (before.assignee_id ?? null) !== (data.assignee_id ?? null);
    let assigneeName: string | null = null;
    if (reassigned && data.assignee_id) {
      const { data: person } = await supabase.from("profiles").select("full_name").eq("id", data.assignee_id).maybeSingle();
      assigneeName = person?.full_name ?? null;
      facts.push({ label: "Assigned to", value: assigneeName ?? "—" });
    }

    const title = `“${truncate(data.title, 80)}”`;
    const statusChanged = before.status !== data.status;
    const summary = statusChanged
      ? data.status === "completed" ? `completed ${title}` : `moved ${title} to ${DELIVERABLE_STATUS[data.status].label}`
      : reassigned && assigneeName ? `assigned ${title} to ${assigneeName}`
      : facts.length ? `updated ${title}` : `edited ${title}`;

    await recordEvent({
      actor,
      action: statusChanged ? "deliverable.status_changed" : "deliverable.updated",
      category: "deliverables",
      summary,
      entity: { type: "deliverable", id: data.id, label: data.title },
      link: link(data.id),
      include: [data.assignee_id, reassigned ? before.assignee_id : null],
      importance: statusChanged && (data.status === "completed" || data.status === "blocked") ? "high" : facts.length ? "normal" : "low",
      tone: data.status === "completed" && statusChanged ? "good" : data.status === "blocked" && statusChanged ? "critical" : "default",
      facts,
    });
    refresh();
    return { id: data.id };
  });
}

/** One-click status change from the table, the board or a drag-and-drop. */
export async function setDeliverableStatus(id: string, status: (typeof STATUSES)[number]): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const input = z.object({ id: f.id, status: z.enum(STATUSES) }).parse({ id, status });

    const before = one(await supabase.from("deliverables").select("title, status, assignee_id").eq("id", input.id).single());
    if (before.status === input.status) return undefined;
    check(await supabase.from("deliverables").update({ status: input.status, updated_by: profile.id }).eq("id", input.id));

    const title = `“${truncate(before.title, 80)}”`;
    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: "deliverable.status_changed",
      category: "deliverables",
      summary: input.status === "completed" ? `completed ${title}` : `moved ${title} to ${DELIVERABLE_STATUS[input.status].label}`,
      entity: { type: "deliverable", id: input.id, label: before.title },
      link: link(input.id),
      include: [before.assignee_id],
      importance: input.status === "completed" || input.status === "blocked" ? "high" : "normal",
      tone: input.status === "completed" ? "good" : input.status === "blocked" ? "critical" : "default",
      facts: [{ label: "Status", value: `${DELIVERABLE_STATUS[before.status].label} → ${DELIVERABLE_STATUS[input.status].label}` }],
    });
    refresh();
    return undefined;
  });
}

export async function toggleChecklistItem(id: string, itemId: string, done: boolean): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const row = one(await supabase.from("deliverables").select("title, checklist, assignee_id").eq("id", f.id.parse(id)).single());
    const list = z.array(checklistItem).parse(row.checklist ?? []);
    const item = list.find((i) => i.id === itemId);
    if (!item) throw new ActionError("That checklist item no longer exists.");
    item.done = Boolean(done);
    check(await supabase.from("deliverables").update({ checklist: list as unknown as Json, updated_by: profile.id }).eq("id", id));

    const remaining = list.filter((i) => !i.done).length;
    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: "deliverable.checklist",
      category: "deliverables",
      summary: `${done ? "ticked" : "unticked"} “${truncate(item.label, 60)}” on “${truncate(row.title, 60)}”`,
      detail: remaining ? `${remaining} of ${list.length} checklist items still open.` : "Every checklist item is done.",
      entity: { type: "deliverable", id, label: row.title },
      link: link(id),
      importance: "low",
      tone: remaining ? "default" : "good",
    });
    refresh();
    return undefined;
  });
}

export async function deleteDeliverable(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.delete");
    const row = one(await supabase.from("deliverables").select("title").eq("id", f.id.parse(id)).single());
    check(await supabase.from("deliverables").delete().eq("id", id));
    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: "deliverable.deleted",
      category: "deliverables",
      summary: `removed “${truncate(row.title, 80)}” from the tracker`,
      link: "/deliverables",
      audience: "managers",
      tone: "warning",
    });
    refresh();
    return undefined;
  }, "Deliverable removed");
}
