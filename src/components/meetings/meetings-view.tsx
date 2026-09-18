"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NotebookPen, Plus, Printer, Trash2 } from "lucide-react";
import { createActionsFromMinutes, deleteMeeting, saveMeeting } from "@/app/(app)/meetings/actions";
import { RecordTracker, type TrackerRow } from "@/components/shared/record-tracker";
import { useAction } from "@/components/shared/use-action";
import { useViewer } from "@/components/shell/session-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { formatDateTime } from "@/lib/utils";
import type { Json } from "@/types/database";
import styles from "./meeting-print.module.css";

type Section = { heading: string; points: string[]; actions: string[] };
type SectionDraft = { heading: string; pointsText: string; actionsText: string };
type Meeting = { id: string; title: string; meeting_at: string; venue: string | null; mode: string; status: string; join_url: string | null; attendees: Json; sections: Json };
type Action = { id: string; meeting_id: string | null; title: string; owner_label: string | null; assignee_id: string | null; due_date: string | null; due_label: string | null; status: string; notes: string | null };
type Draft = { id?: string; title: string; meeting_at: string; venue: string; mode: "in_person" | "virtual" | "hybrid"; status: "scheduled" | "held" | "cancelled"; join_url: string; attendees: string; sections: SectionDraft[] };
const newDraft = (): Draft => ({ title: "", meeting_at: "", venue: "", mode: "in_person", status: "scheduled", join_url: "", attendees: "", sections: [] });
function asSections(value: Json): Section[] { return Array.isArray(value) ? value.filter((x): x is { heading: string; points: string[]; actions: string[] } => !!x && typeof x === "object" && !Array.isArray(x) && typeof x.heading === "string" && Array.isArray(x.points) && Array.isArray(x.actions)) : []; }
function asAttendees(value: Json): string[] { return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []; }

export function MeetingsView({ meetings, actions, people }: { meetings: Meeting[]; actions: Action[]; people: { id: string; full_name: string }[] }) {
  const { can } = useViewer();
  useRealtimeRefresh(["meetings", "action_items"]);
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const selectedId = params.get("meeting") ?? (meetings.find((m) => asSections(m.sections).length)?.id ?? meetings[0]?.id);
  const selected = meetings.find((m) => m.id === selectedId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(newDraft);
  const [confirm, setConfirm] = useState(false);
  const [save, saving] = useAction(saveMeeting, { success: "Meeting saved", onSuccess: ({ id }) => { setEditing(false); choose(id); } });
  const [remove, removing] = useAction(deleteMeeting, { success: "Meeting removed", onSuccess: () => { setConfirm(false); choose(null); } });
  const [importActions, importing] = useAction(createActionsFromMinutes, { success: ({ count }) => count ? `${count} action points created` : "All minutes actions are already tracked" });
  function choose(id: string | null) { const next = new URLSearchParams(params.toString()); if (id) next.set("meeting", id); else next.delete("meeting"); router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }); }
  function edit(m?: Meeting) { setDraft(m ? { id: m.id, title: m.title, meeting_at: m.meeting_at.slice(0, 16), venue: m.venue ?? "", mode: m.mode as Draft["mode"], status: m.status as Draft["status"], join_url: m.join_url ?? "", attendees: asAttendees(m.attendees).join(", "), sections: asSections(m.sections).map((s) => ({ heading: s.heading, pointsText: s.points.join("\n"), actionsText: s.actions.join("\n") })) } : newDraft()); setEditing(true); }
  function updateSection(index: number, patch: Partial<SectionDraft>) { setDraft((current) => ({ ...current, sections: current.sections.map((s, i) => i === index ? { ...s, ...patch } : s) })); }
  const groups = meetings.map((m) => ({ value: m.id, label: m.title }));
  const rows: TrackerRow[] = actions.map((a) => ({ id: a.id, title: a.title, subtitle: [a.owner_label, a.due_date].filter(Boolean).join(" · "), group: a.meeting_id ?? "Unlinked", status: a.status,
    values: { meeting_id: a.meeting_id, title: a.title, owner_label: a.owner_label, assignee_id: a.assignee_id, due_date: a.due_date, due_label: a.due_label, status: a.status, notes: a.notes } }));

  return <><RecordTracker kind="actions" rows={rows} groups={[...groups, { value: "Unlinked", label: "No meeting" }]} groupLabel="Meeting" eyebrow="Plan"
    title="Meetings & actions" description="Minutes from each planning meeting and the live action points that follow." table="action_items"
    extra={<section className="mb-6"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-bold text-ink">Meeting minutes</h2>{can("records.write") && <Button size="sm" onClick={() => edit()}><Plus /> New meeting</Button>}</div>
      {meetings.length === 0 ? <Card><EmptyState icon={NotebookPen} title="No meetings yet" description="Create a meeting to record minutes and assign actions." /></Card> : <>
        <div className="scroll-none -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">{meetings.map((m) => <Button key={m.id} size="sm" variant={selectedId === m.id ? "primary" : "outline"} onClick={() => choose(m.id)}>{m.title}</Button>)}</div>
        {selected && <Card className={`${styles.printArea} p-4 sm:p-6`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Badge tone={selected.status === "held" ? "good" : selected.status === "cancelled" ? "critical" : "accent"}>{selected.status}</Badge><span className="text-xs text-ink-3">{formatDateTime(selected.meeting_at)}</span></div><h3 className="mt-2 text-lg font-extrabold text-ink">{selected.title}</h3><p className="mt-1 text-xs text-ink-3">{selected.venue || selected.mode.replaceAll("_", " ")}</p></div><div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> Print</Button>{can("records.write") && <Button variant="outline" size="sm" onClick={() => edit(selected)}>Edit minutes</Button>}{can("records.delete") && <Button variant="danger-ghost" size="sm" onClick={() => setConfirm(true)}><Trash2 /> Delete</Button>}</div></div>
          {asAttendees(selected.attendees).length > 0 && <div className="mt-4"><p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Attendees</p><p className="mt-1 text-[13px] text-ink-2">{asAttendees(selected.attendees).join(" · ")}</p></div>}
          {asSections(selected.sections).length ? <div className="mt-5 grid gap-5">{asSections(selected.sections).map((section, index) => <section key={index} className="border-t border-line pt-4"><h4 className="text-sm font-bold text-ink">{index + 1}. {section.heading}</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink-2">{section.points.map((point, i) => <li key={i}>{point}</li>)}</ul>{section.actions.length > 0 && <div className="mt-3 rounded-xl bg-accent-soft p-3"><p className="text-xs font-bold text-accent-ink">Actions</p><ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-ink-2">{section.actions.map((action, i) => <li key={i}>{action}</li>)}</ul></div>}</section>)}</div> : <p className="mt-5 text-xs text-ink-3">Minutes have not been added yet.</p>}
          {can("records.write") && asSections(selected.sections).some((s) => s.actions.length) && <div className="mt-5 border-t border-line pt-4 print:hidden"><Button variant="outline" size="sm" loading={importing} onClick={() => importActions(selected.id)}>Create action points from minutes</Button></div>}
        </Card>}
      </>}
    </section>}
    fields={[{ name: "meeting_id", label: "Meeting", kind: "select", options: groups }, { name: "title", label: "Action point", required: true },
      { name: "owner_label", label: "Owner" }, { name: "assignee_id", label: "Team assignee", kind: "select", options: people.map((p) => ({ value: p.id, label: p.full_name })) },
      { name: "status", label: "Status", kind: "select", required: true, options: [{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "done", label: "Done" }] },
      { name: "due_date", label: "Due date", kind: "date" }, { name: "due_label", label: "Due note" }, { name: "notes", label: "Notes", kind: "textarea" }]} />
    <Dialog open={editing} onOpenChange={setEditing}><DialogContent title={draft.id ? "Edit meeting" : "New meeting"} size="lg" footer={<><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" form="meeting-form" loading={saving}>Save meeting</Button></>}>
      <form id="meeting-form" className="grid gap-4" onSubmit={(event) => { event.preventDefault(); save({ ...draft, meeting_at: new Date(`${draft.meeting_at}:00Z`).toISOString(), attendees: draft.attendees.split(",").map((x) => x.trim()).filter(Boolean), sections: draft.sections.map((s) => ({ heading: s.heading, points: s.pointsText.split("\n").map((x) => x.trim()).filter(Boolean), actions: s.actionsText.split("\n").map((x) => x.trim()).filter(Boolean) })) }); }}>
        <Field label="Meeting title" htmlFor="meeting-title"><Input id="meeting-title" required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Date and time (Accra)" htmlFor="meeting-at"><Input id="meeting-at" type="datetime-local" required value={draft.meeting_at} onChange={(e) => setDraft({ ...draft, meeting_at: e.target.value })} /></Field><Field label="Venue" htmlFor="meeting-venue" optional><Input id="meeting-venue" value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Mode" htmlFor="meeting-mode"><Select id="meeting-mode" value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as Draft["mode"] })}><option value="in_person">In person</option><option value="virtual">Virtual</option><option value="hybrid">Hybrid</option></Select></Field><Field label="Status" htmlFor="meeting-status"><Select id="meeting-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}><option value="scheduled">Scheduled</option><option value="held">Held</option><option value="cancelled">Cancelled</option></Select></Field></div>
        <Field label="Join link" htmlFor="meeting-link" optional><Input id="meeting-link" type="url" value={draft.join_url} onChange={(e) => setDraft({ ...draft, join_url: e.target.value })} /></Field>
        <Field label="Attendees" htmlFor="meeting-attendees" hint="Separate names with commas."><Input id="meeting-attendees" value={draft.attendees} onChange={(e) => setDraft({ ...draft, attendees: e.target.value })} /></Field>
        <div className="border-t border-line pt-4"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-ink">Minutes</h3><Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, sections: [...draft.sections, { heading: "", pointsText: "", actionsText: "" }] })}><Plus /> Add section</Button></div>
          <div className="mt-3 grid gap-4">{draft.sections.map((section, index) => <div key={index} className="rounded-xl border border-line bg-surface-2 p-3.5"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold text-ink-2">Section {index + 1}</p><Button type="button" size="sm" variant="danger-ghost" onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, i) => i !== index) })}><Trash2 /> Remove</Button></div><div className="grid gap-3"><Field label="Heading" htmlFor={`section-heading-${index}`}><Input id={`section-heading-${index}`} required value={section.heading} onChange={(e) => updateSection(index, { heading: e.target.value })} /></Field><Field label="Discussion points" htmlFor={`section-points-${index}`} hint="One point per line."><Textarea id={`section-points-${index}`} value={section.pointsText} onChange={(e) => updateSection(index, { pointsText: e.target.value })} /></Field><Field label="Actions" htmlFor={`section-actions-${index}`} hint="One action per line. You can turn these into tracked action points after saving."><Textarea id={`section-actions-${index}`} value={section.actionsText} onChange={(e) => updateSection(index, { actionsText: e.target.value })} /></Field></div></div>)}</div>
        </div>
      </form>
    </DialogContent></Dialog>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete meeting?" description={`“${selected?.title ?? "This meeting"}” and its linked action points will be removed. This cannot be undone.`} confirmLabel="Delete meeting" destructive loading={removing} onConfirm={() => { if (selected) remove(selected.id); }} />
  </>;
}
