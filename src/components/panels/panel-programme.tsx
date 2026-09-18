"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { deleteQuestion, savePanel, saveQuestion } from "@/app/(app)/panels/actions";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";

type Panel = { id: string; number: number; title: string; perspective: string | null; moderator: string | null; starts_at: string | null; duration_minutes: number | null; notes: string | null };
type Question = { id: string; panel_id: string; question: string; sort_order: number };
type PanelDraft = { number: string; title: string; perspective: string; moderator: string; starts_at: string; duration_minutes: string; notes: string };
const draftFrom = (p?: Panel): PanelDraft => ({ number: String(p?.number ?? ""), title: p?.title ?? "", perspective: p?.perspective ?? "", moderator: p?.moderator ?? "",
  starts_at: p?.starts_at?.slice(0, 16) ?? "", duration_minutes: String(p?.duration_minutes ?? ""), notes: p?.notes ?? "" });

export function PanelProgramme({ panels, questions, speakers }: { panels: Panel[]; questions: Question[]; speakers: { panel_id: string; status: string }[] }) {
  const { can } = useViewer();
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const selectedId = params.get("panel"), creating = params.get("newpanel") === "1";
  const selected = panels.find((p) => p.id === selectedId);
  const [panelState, setPanelState] = useState<{ key: string; value: PanelDraft }>({ key: "", value: draftFrom() });
  const key = selectedId ?? (creating ? "new" : "");
  const draft = panelState.key === key ? panelState.value : draftFrom(selected);
  const setDraft = (value: PanelDraft) => setPanelState({ key, value });
  const [question, setQuestion] = useState<{ id?: string; text: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [save, saving] = useAction(savePanel, { success: "Panel saved", onSuccess: ({ id }) => navigate({ panel: id, newpanel: null }) });
  const [saveQ, savingQ] = useAction(saveQuestion, { success: "Question saved", onSuccess: () => setQuestion(null) });
  const [removeQ, removingQ] = useAction(deleteQuestion, { success: "Question removed", onSuccess: () => setDeleteId(null) });
  function navigate(patch: Record<string, string | null>) { const next = new URLSearchParams(params.toString()); for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); } router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }); }
  function open(p?: Panel) { setPanelState({ key: p?.id ?? "new", value: draftFrom(p) }); navigate({ panel: p?.id ?? null, newpanel: p ? null : "1" }); }
  const panelQuestions = questions.filter((q) => q.panel_id === selectedId);
  return <div className="mb-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-ink">Programme at a glance</h2>{can("records.write") && <Button variant="outline" size="sm" onClick={() => open()}><Plus /> New panel</Button>}</div>
    <div className="grid gap-3 lg:grid-cols-3">{panels.map((panel) => { const people = speakers.filter((s) => s.panel_id === panel.id); return <Card key={panel.id} className="p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">Panel {panel.number}</p><h3 className="mt-1 text-sm font-bold text-ink">{panel.title}</h3>{panel.perspective && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{panel.perspective}</p>}<div className="mt-3 flex flex-wrap gap-2"><Badge tone="neutral">{people.length} speakers</Badge><Badge tone="good">{people.filter((x) => x.status === "confirmed").length} confirmed</Badge><Badge tone="accent">{questions.filter((x) => x.panel_id === panel.id).length} questions</Badge></div><Button className="mt-3" variant="outline" size="sm" onClick={() => open(panel)}>Programme details</Button></Card>; })}</div>
    <Dialog open={creating || !!selected} onOpenChange={(value) => { if (!value) navigate({ panel: null, newpanel: null }); }}><SheetContent title={selected ? `Panel ${selected.number}` : "New panel"} description={selected?.title ?? "Add a session to the programme."} footer={can("records.write") ? <><Button variant="outline" onClick={() => navigate({ panel: null, newpanel: null })}>Close</Button><Button form="panel-form" type="submit" loading={saving}>Save panel</Button></> : undefined}>
      <form id="panel-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save({ ...(selected ? { id: selected.id } : {}), ...draft, number: Number(draft.number), duration_minutes: draft.duration_minutes, starts_at: draft.starts_at ? new Date(`${draft.starts_at}:00Z`).toISOString() : "" }); }}>
        <div className="grid grid-cols-2 gap-3"><Field label="Number" htmlFor="panel-number"><Input id="panel-number" type="number" min="1" required disabled={!can("records.write")} value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} /></Field><Field label="Duration (minutes)" htmlFor="panel-duration" optional><Input id="panel-duration" type="number" min="0" disabled={!can("records.write")} value={draft.duration_minutes} onChange={(e) => setDraft({ ...draft, duration_minutes: e.target.value })} /></Field></div>
        <Field label="Title" htmlFor="panel-title"><Input id="panel-title" required disabled={!can("records.write")} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
        <Field label="Perspective" htmlFor="panel-perspective" optional><Textarea id="panel-perspective" disabled={!can("records.write")} value={draft.perspective} onChange={(e) => setDraft({ ...draft, perspective: e.target.value })} /></Field>
        <Field label="Moderator" htmlFor="panel-moderator" optional><Input id="panel-moderator" disabled={!can("records.write")} value={draft.moderator} onChange={(e) => setDraft({ ...draft, moderator: e.target.value })} /></Field>
        <Field label="Starts at (Accra)" htmlFor="panel-start" optional><Input id="panel-start" type="datetime-local" disabled={!can("records.write")} value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} /></Field>
        <Field label="Notes" htmlFor="panel-notes" optional><Textarea id="panel-notes" disabled={!can("records.write")} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
      </form>
      {selected && <section className="mt-7 border-t border-line pt-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-ink">Panel questions</h3>{can("records.write") && <Button variant="outline" size="sm" onClick={() => setQuestion({ text: "" })}><Plus /> Add</Button>}</div>{panelQuestions.length ? <ol className="mt-3 grid gap-2">{panelQuestions.map((q, i) => <li key={q.id} className="flex items-start gap-2 rounded-xl bg-surface-2 p-3"><span className="text-xs font-bold text-ink-3">{i + 1}.</span><p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-2">{q.question}</p>{can("records.write") && <Button variant="ghost" size="sm" onClick={() => setQuestion({ id: q.id, text: q.question })}>Edit</Button>}{can("records.delete") && <Button variant="danger-ghost" size="icon-sm" aria-label="Delete question" onClick={() => setDeleteId(q.id)}><Trash2 /></Button>}</li>)}</ol> : <p className="mt-3 text-xs text-ink-3">No questions recorded for this panel.</p>}
        {question && can("records.write") && <form className="mt-4 rounded-xl border border-line p-3" onSubmit={(e) => { e.preventDefault(); saveQ({ ...(question.id ? { id: question.id } : {}), panel_id: selected.id, question: question.text, sort_order: question.id ? panelQuestions.find((q) => q.id === question.id)?.sort_order ?? 0 : panelQuestions.length }); }}><Field label="Question" htmlFor="question-text"><Textarea id="question-text" required value={question.text} onChange={(e) => setQuestion({ ...question, text: e.target.value })} /></Field><div className="mt-2 flex gap-2"><Button type="submit" size="sm" loading={savingQ}>Save question</Button><Button variant="ghost" size="sm" onClick={() => setQuestion(null)}>Cancel</Button></div></form>}
      </section>}
    </SheetContent></Dialog>
    <ConfirmDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }} title="Delete question?" description="This panel question will be removed." confirmLabel="Delete" destructive loading={removingQ} onConfirm={() => { if (deleteId) removeQ(deleteId); }} />
  </div>;
}
