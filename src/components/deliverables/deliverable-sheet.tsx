"use client";

import { useState } from "react";
import { Flag, Plus, Trash2, X } from "lucide-react";
import { deleteDeliverable, saveDeliverable, toggleChecklistItem } from "@/app/(app)/deliverables/actions";
import { isOverdue, readChecklist, type ChecklistItem, type Deliverable, type Person, type Workstream } from "@/components/deliverables/types";
import { useViewer } from "@/components/shell/session-context";
import { Comments } from "@/components/shared/comments";
import { useAction } from "@/components/shared/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, SheetContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Meter } from "@/components/ui/misc";
import { DELIVERABLE_STATUS, DELIVERABLE_STATUS_ORDER, PRIORITY, PRIORITY_ORDER, type DeliverableStatus, type Priority } from "@/lib/domain";
import { cn, daysUntil, timeAgo } from "@/lib/utils";

type Props = {
  open: boolean;
  deliverable: Deliverable | null;
  defaultWorkstreamId: string;
  workstreams: Workstream[];
  people: Person[];
  organizations: string[];
  sections: string[];
  today: string;
  onClose: () => void;
};

/** Create, edit or (for viewers) read a deliverable — with its checklist and discussion. */
export function DeliverableSheet({ open, deliverable, defaultWorkstreamId, workstreams, people, organizations, sections, today, onClose }: Props) {
  const { can } = useViewer();
  const editable = can("records.write");
  const isNew = !deliverable;

  const [title, setTitle] = useState(deliverable?.title ?? "");
  const [workstreamId, setWorkstreamId] = useState(deliverable?.workstream_id ?? defaultWorkstreamId);
  const [section, setSection] = useState(deliverable?.section ?? "");
  const [quantity, setQuantity] = useState(deliverable?.quantity?.toString() ?? "");
  const [responsibility, setResponsibility] = useState(deliverable?.responsibility ?? "");
  const [assigneeId, setAssigneeId] = useState(deliverable?.assignee_id ?? "");
  const [status, setStatus] = useState<DeliverableStatus>(deliverable?.status ?? "pending");
  const [priority, setPriority] = useState<Priority>(deliverable?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(deliverable?.due_date ?? "");
  const [comment, setComment] = useState(deliverable?.comment ?? "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => readChecklist(deliverable?.checklist));
  const [newItem, setNewItem] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [save, saving] = useAction(saveDeliverable, { success: isNew ? "Deliverable added" : "Changes saved", onSuccess: onClose });
  const [toggle] = useAction(toggleChecklistItem, { silent: true });
  const [remove, removing] = useAction(deleteDeliverable, { onSuccess: onClose });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = await save({
      id: deliverable?.id, title, workstream_id: workstreamId, section: section || "General", quantity, responsibility,
      assignee_id: assigneeId, status, priority, due_date: dueDate, comment, checklist,
    });
    setErrors(result.ok ? {} : (result.fieldErrors ?? {}));
  }

  function addChecklistItem() {
    const label = newItem.trim();
    if (!label) return;
    setChecklist((list) => [...list, { id: crypto.randomUUID().slice(0, 8), label, done: false }]);
    setNewItem("");
  }

  function onToggle(item: ChecklistItem, done: boolean) {
    setChecklist((list) => list.map((i) => (i.id === item.id ? { ...i, done } : i)));
    // Saved items tick straight through to the server (and alert the team); brand-new ones ride along with Save.
    const persisted = readChecklist(deliverable?.checklist).some((i) => i.id === item.id);
    if (deliverable && persisted) toggle(deliverable.id, item.id, done);
  }

  const late = deliverable ? isOverdue({ status, due_date: dueDate || null }, today) : false;
  const doneCount = checklist.filter((i) => i.done).length;
  const formId = "deliverable-form";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        title={isNew ? "New deliverable" : deliverable.title}
        description={isNew ? "Add an item to the summit tracker." : `Updated ${timeAgo(deliverable.updated_at)}`}
        footer={
          editable ? (
            <>
              {!isNew && can("records.delete") && (
                <Button type="button" variant="danger-ghost" className="mr-auto" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" form={formId} loading={saving}>{isNew ? "Add deliverable" : "Save changes"}</Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          )
        }
      >
        {!isNew && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone={DELIVERABLE_STATUS[status].tone} icon={DELIVERABLE_STATUS[status].icon}>{DELIVERABLE_STATUS[status].label}</Badge>
            {late && <Badge tone="critical" icon={Flag}>{-(daysUntil(dueDate, today) ?? 0)} days overdue</Badge>}
            {!editable && <Badge tone="neutral">Read only</Badge>}
          </div>
        )}

        <form id={formId} onSubmit={submit} className="grid gap-4">
          <fieldset disabled={!editable} className="grid gap-4 disabled:opacity-100">
            <Field label="Deliverable" htmlFor="d-title" error={errors.title}>
              <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="e.g. Stage backdrop artwork" autoFocus={isNew} aria-invalid={Boolean(errors.title)} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Workstream" htmlFor="d-ws">
                <Select id="d-ws" value={workstreamId} onChange={(e) => setWorkstreamId(e.target.value)} required>
                  {workstreams.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </Field>
              <Field label="Section" htmlFor="d-section" hint="Groups items inside the workstream." error={errors.section}>
                <Input id="d-section" value={section} onChange={(e) => setSection(e.target.value)} list="d-sections" maxLength={80} placeholder="e.g. Registration Area" />
                <datalist id="d-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status" htmlFor="d-status">
                <Select id="d-status" value={status} onChange={(e) => setStatus(e.target.value as DeliverableStatus)}>
                  {DELIVERABLE_STATUS_ORDER.map((s) => <option key={s} value={s}>{DELIVERABLE_STATUS[s].label}</option>)}
                </Select>
              </Field>
              <Field label="Priority" htmlFor="d-priority">
                <Select id="d-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Responsible organisation" htmlFor="d-resp" optional>
                <Input id="d-resp" value={responsibility} onChange={(e) => setResponsibility(e.target.value)} list="d-orgs" maxLength={80} placeholder="GMA, PanAvest, NVAME…" />
                <datalist id="d-orgs">{organizations.map((o) => <option key={o} value={o} />)}</datalist>
              </Field>
              <Field label="Assigned to" htmlFor="d-assignee" optional hint="They're alerted about every change.">
                <Select id="d-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">Nobody yet</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.organization ? ` · ${p.organization}` : ""}</option>)}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Due date" htmlFor="d-due" optional error={errors.due_date}>
                <Input id="d-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
              <Field label="Quantity" htmlFor="d-qty" optional error={errors.quantity}>
                <Input id="d-qty" type="number" inputMode="numeric" min={0} max={1000000} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="—" />
              </Field>
            </div>

            <Field label="Notes" htmlFor="d-comment" optional error={errors.comment}>
              <Textarea id="d-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="Where it stands, what it's waiting on…" />
            </Field>
          </fieldset>

          {/* Checklist */}
          <section aria-label="Checklist" className="rounded-xl border border-line p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-bold text-ink">Checklist</h3>
              {checklist.length > 0 && (
                <span className="flex w-32 items-center gap-2">
                  <Meter value={doneCount} max={checklist.length} label="Checklist progress" size="sm" tone="good" />
                  <span className="tabular text-[11px] font-bold text-ink-2">{doneCount}/{checklist.length}</span>
                </span>
              )}
            </div>
            {checklist.length === 0 && <p className="text-xs text-ink-3">{editable ? "Break the work into steps the team can tick off." : "No checklist."}</p>}
            <ul className="grid gap-1">
              {checklist.map((item) => (
                <li key={item.id} className="group flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-surface-2">
                  <Checkbox id={`c-${item.id}`} checked={item.done} disabled={!editable} onCheckedChange={(v) => onToggle(item, v === true)} className="mt-px" />
                  <label htmlFor={`c-${item.id}`} className={cn("flex-1 text-[13px] leading-snug", item.done ? "text-ink-3 line-through" : "text-ink")}>{item.label}</label>
                  {editable && (
                    <button type="button" onClick={() => setChecklist((list) => list.filter((i) => i.id !== item.id))} aria-label={`Remove “${item.label}”`} className="rounded p-0.5 text-ink-3 opacity-0 hover:text-critical-ink focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {editable && (
              <div className="mt-2 flex gap-2">
                <Input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                  placeholder="Add a step…"
                  aria-label="New checklist item"
                  maxLength={200}
                  className="h-9"
                />
                <Button type="button" variant="secondary" size="icon" onClick={addChecklistItem} disabled={!newItem.trim()} aria-label="Add checklist item"><Plus /></Button>
              </div>
            )}
          </section>
        </form>

        {deliverable && (
          <div className="mt-6 border-t border-line pt-5">
            <Comments entityType="deliverable" entityId={deliverable.id} entityLabel={deliverable.title} link={`/deliverables?item=${deliverable.id}`} />
          </div>
        )}
      </SheetContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this deliverable?"
        description={`“${deliverable?.title ?? ""}” and its comments will be removed for everyone. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        loading={removing}
        onConfirm={() => deliverable && remove(deliverable.id)}
      />
    </Dialog>
  );
}
