import type { DeliverableStatus, Priority } from "@/lib/domain";

export type ChecklistItem = { id: string; label: string; done: boolean };

export type Workstream = { id: string; slug: string; name: string; description: string | null; color_slot: number };

export type Person = { id: string; full_name: string; avatar_url: string | null; organization: string | null };

export type Deliverable = {
  id: string;
  workstream_id: string;
  section: string;
  title: string;
  quantity: number | null;
  responsibility: string | null;
  assignee_id: string | null;
  status: DeliverableStatus;
  priority: Priority;
  due_date: string | null;
  comment: string | null;
  checklist: unknown;
  sort_order: number;
  updated_at: string;
  assignee: { id: string; full_name: string; avatar_url: string | null } | null;
};

export function readChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((i): i is ChecklistItem => Boolean(i) && typeof i === "object" && typeof (i as ChecklistItem).id === "string" && typeof (i as ChecklistItem).label === "string")
    .map((i) => ({ id: i.id, label: i.label, done: Boolean(i.done) }));
}

export const isOverdue = (d: Pick<Deliverable, "status" | "due_date">, today: string) => d.status !== "completed" && d.due_date !== null && d.due_date < today;
