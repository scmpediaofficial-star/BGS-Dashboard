"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download, FileImage, FileSpreadsheet, FileText, GraduationCap, Hourglass, Link2, MessageSquareText, Plus, Search, Trash2, Upload, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { deleteTickets, setTicketStatus } from "@/app/(app)/tickets/actions";
import { importStudents, saveStudent } from "@/app/(app)/tickets/student-actions";
import { StatTile } from "@/components/charts/stat-tile";
import { copyText } from "@/components/payments/shared";
import { StatusMenu } from "@/components/shared/status-menu";
import { useAction } from "@/components/shared/use-action";
import { useViewer } from "@/components/shell/session-context";
import { saveBlob, ticketFileName, ticketsPdf, ticketsPngZip, type TicketEvent, type TicketFace } from "@/components/tickets/ticket-art";
import { TicketPreview } from "@/components/tickets/ticket-desk";
import { TicketDownload } from "@/components/tickets/ticket-download";
import { toFace, type InstitutionLite, type TicketRow } from "@/components/tickets/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent, SheetContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, FilterChip } from "@/components/ui/misc";
import { TICKET_STATUS, TICKET_STATUS_ORDER } from "@/lib/domain";
import { parseStudentList } from "@/lib/student-list";
import { formatDate, formatNumber, isoDay, pluralize, toCsv } from "@/lib/utils";

/**
 * Complimentary student tickets. Each student collects their own on /student-ticket
 * with the ticket code; this desk is where the team adds them and sees who is
 * still outstanding: details missing, details in, downloaded, checked in.
 */

type Stage = "awaiting" | "ready" | "downloaded";
type Filter = "all" | Stage;
const PAGE = 100;

const hasDetails = (t: TicketRow) => !!(t.programme && t.holder_email && t.holder_phone);
const stageOf = (t: TicketRow): Stage => (!hasDetails(t) ? "awaiting" : t.download_count > 0 ? "downloaded" : "ready");
const STAGE = {
  awaiting: { label: "Awaiting details", tone: "warning", icon: Hourglass },
  ready: { label: "Details in", tone: "accent", icon: UserCheck },
  downloaded: { label: "Downloaded", tone: "good", icon: Download },
} as const;

type Draft = { holder_name: string; student_number: string; institution_id: string; programme: string; holder_email: string; holder_phone: string; notes: string };
const draftOf = (t: TicketRow, fallbackInstitution: string): Draft => ({
  holder_name: t.holder_name ?? "", student_number: t.student_number ?? "", institution_id: t.institution_id ?? fallbackInstitution, programme: t.programme ?? "",
  holder_email: t.holder_email ?? "", holder_phone: t.holder_phone ?? "", notes: t.notes ?? "",
});

export function StudentDesk({ tickets, institutions, event }: { tickets: TicketRow[]; institutions: InstitutionLite[]; event: TicketEvent }) {
  const { can } = useViewer();
  const manage = can("tickets.manage");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const students = useMemo(() => tickets.filter((t) => t.kind === "student"), [tickets]);
  const institutionOf = useMemo(() => new Map(institutions.map((i) => [i.id, i])), [institutions]);
  // The summit's student partner is preselected; anyone else is one click away.
  const defaultInstitution = (institutions.find((i) => /upsa|university of professional studies/i.test(i.name)) ?? institutions[0])?.id ?? "";

  const openId = params.get("student");
  const adding = params.get("new") === "student";
  const importing = params.get("new") === "import";
  const selected = students.find((t) => t.id === openId);
  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "students");
    for (const [key, value] of Object.entries(patch)) { if (value === null || value === "") next.delete(key); else next.set(key, value); }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const [progress, setProgress] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pasted, setPasted] = useState({ institution_id: "", text: "" });

  const draftKey = openId ?? (adding ? "new" : "");
  const [draftState, setDraftState] = useState<{ key: string; values: Draft | null }>({ key: "", values: null });
  const blank: Draft = { holder_name: "", student_number: "", institution_id: defaultInstitution, programme: "", holder_email: "", holder_phone: "", notes: "" };
  const draft: Draft = draftState.key === draftKey && draftState.values ? draftState.values : selected ? draftOf(selected, defaultInstitution) : blank;
  const setDraft = (values: Draft) => setDraftState({ key: draftKey, values });

  const [save, saving] = useAction(saveStudent, { success: "Student saved", onSuccess: ({ id }) => setParams({ new: null, student: id }) });
  const [changeStatus] = useAction(setTicketStatus, { success: "Ticket updated" });
  const [remove, removing] = useAction(deleteTickets, { success: "Student ticket deleted", onSuccess: () => { setConfirmDelete(false); setParams({ student: null }); } });
  const [bulkImport, importingNow] = useAction(importStudents, {
    success: ({ added, skipped }) => `${pluralize(added, "student ticket")} issued${skipped.length ? ` · ${pluralize(skipped.length, "student")} already had one` : ""}`,
    onSuccess: () => { setPasted({ institution_id: pasted.institution_id, text: "" }); setParams({ new: null }); },
  });

  const live = useMemo(() => students.filter((t) => t.status !== "void"), [students]);
  const stats = useMemo(() => ({
    total: live.length, awaiting: live.filter((t) => stageOf(t) === "awaiting").length, downloaded: live.filter((t) => t.download_count > 0).length,
    checkedIn: live.filter((t) => t.status === "checked_in").length,
  }), [live]);
  const counts = useMemo(() => ({ all: live.length, awaiting: stats.awaiting, ready: live.filter((t) => stageOf(t) === "ready").length, downloaded: stats.downloaded }), [live, stats]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return live.filter((t) => (filter === "all" || stageOf(t) === filter) &&
      (!needle || `${t.code} ${t.code.replace(/-/g, "")} ${t.holder_name ?? ""} ${t.student_number ?? ""} ${t.programme ?? ""} ${t.holder_email ?? ""} ${t.holder_phone ?? ""}`.toLowerCase().includes(needle)));
  }, [live, filter, query]);
  const visible = filtered.slice(0, shown);

  const inst = (t: TicketRow) => (t.institution_id ? institutionOf.get(t.institution_id) : undefined);
  const printed = (t: TicketRow) => ({ ...t, organization: inst(t)?.name ?? t.organization, logoUrl: inst(t)?.logo_url ?? null });
  const link = (t: TicketRow) => `${window.location.origin}/student-ticket?code=${t.code}`;
  const message = (t: TicketRow) => `Hello ${(t.holder_name ?? "").split(" ")[0] || "there"}, your complimentary student ticket for the ${event.dateLine} summit at ${event.venueLine} is ready. Open ${link(t)} (your code is ${t.code}), add your programme, email and phone number, then download your ticket.`;

  function exportCsv(rows: TicketRow[], name: string) {
    const csv = toCsv([["Name", "Student no.", "Institution", "Programme", "Email", "Phone", "Ticket no.", "Link", "Details", "Downloads", "First downloaded", "Status", "Checked in"],
      ...rows.map((t) => [t.holder_name, t.student_number, inst(t)?.name ?? t.organization, t.programme, t.holder_email, t.holder_phone, t.code, link(t), hasDetails(t) ? "Complete" : "Awaiting",
        t.download_count, t.first_downloaded_at ? isoDay(t.first_downloaded_at) : "", TICKET_STATUS[t.status].label, t.checked_in_at ? isoDay(t.checked_in_at) : ""])]);
    saveBlob(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }), `${name}-${isoDay()}.csv`);
  }
  async function bulk(format: "pdf" | "png") {
    if (!filtered.length || progress) return;
    const faces = filtered.map((t) => { const p = printed(t); return toFace(p, p.logoUrl); });
    const label = (done: number) => `Preparing ${formatNumber(done)} of ${formatNumber(faces.length)}…`;
    setProgress(label(0));
    try {
      const report = (done: number) => setProgress(label(done));
      const blob = format === "pdf" ? await ticketsPdf(faces, event, report) : await ticketsPngZip(faces, event, (face: TicketFace) => `${ticketFileName(face)}.png`, report);
      saveBlob(blob, `BGS-2026-student-tickets-${faces.length}.${format === "pdf" ? "pdf" : "zip"}`);
      toast.success(`${pluralize(faces.length, "ticket")} saved`);
    } catch (error) {
      console.error("[students]", error);
      toast.error("The tickets could not be created. Check your connection and try again.");
    } finally { setProgress(null); }
  }

  const missingLogo = institutions.length > 0 && live.some((t) => !inst(t)?.logo_url);
  const parsed = useMemo(() => parseStudentList(pasted.text), [pasted.text]);
  const draftFace: TicketFace | null = selected ? { code: selected.code, kind: "student", name: draft.holder_name.trim() || null, organization: institutionOf.get(draft.institution_id)?.name ?? selected.organization, roleLabel: null, logoUrl: institutionOf.get(draft.institution_id)?.logo_url ?? null } : null;

  return (
    <>
      <section aria-label="Student tickets so far" className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Student tickets" value={formatNumber(stats.total)} icon={GraduationCap} caption="Complimentary, one per student" />
        <StatTile label="Awaiting details" value={formatNumber(stats.awaiting)} icon={Hourglass} caption={stats.awaiting ? "Still need programme, email or phone" : "Everyone has given their details"} />
        <StatTile label="Downloaded" value={formatNumber(stats.downloaded)} unit={stats.total ? `of ${formatNumber(stats.total)}` : undefined} icon={Download} caption="Have saved their ticket" tone="good" />
        <StatTile label="Checked in" value={formatNumber(stats.checkedIn)} icon={UserCheck} caption="Admitted on the day" />
      </section>

      {missingLogo && <Card className="mb-4 p-4 text-[13px] text-ink-2">The institution has no logo yet, so student tickets are printing without one. Upload it on the <a className="font-semibold text-accent-ink hover:underline" href="/institutions">Institutions</a> page.</Card>}

      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search students" placeholder="Search by name, student no., programme or ticket no.…" className="pl-9" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" loading={!!progress} disabled={!filtered.length}>{!progress && <Download />} {progress ?? "Export"} {!progress && <ChevronDown aria-hidden className="opacity-60" />}</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{pluralize(filtered.length, "student")} shown</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => exportCsv(filtered, "BGS-2026-student-list")}><FileSpreadsheet aria-hidden /> Student list with codes and links (CSV)</DropdownMenuItem>
              {manage && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => bulk("pdf")}><FileText aria-hidden /> All tickets, one PDF</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => bulk("png")}><FileImage aria-hidden /> All tickets, PNGs in a .zip</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
          {manage && <>
            <Button variant="outline" onClick={() => setParams({ new: "import", student: null })}><Upload /> Import a list</Button>
            <Button onClick={() => { setDraftState({ key: "new", values: blank }); setParams({ new: "student", student: null }); }}><Plus /> Add a student</Button>
          </>}
        </div>
      </div>

      <div className="scroll-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <FilterChip active={filter === "all"} count={counts.all} onClick={() => { setFilter("all"); setShown(PAGE); }}>All students</FilterChip>
        <FilterChip active={filter === "awaiting"} count={counts.awaiting} onClick={() => { setFilter("awaiting"); setShown(PAGE); }}>Awaiting details</FilterChip>
        <FilterChip active={filter === "ready"} count={counts.ready} onClick={() => { setFilter("ready"); setShown(PAGE); }}>Details in, not downloaded</FilterChip>
        <FilterChip active={filter === "downloaded"} count={counts.downloaded} onClick={() => { setFilter("downloaded"); setShown(PAGE); }}>Downloaded</FilterChip>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={GraduationCap} title={live.length ? "No students match" : "No student tickets yet"}
            description={live.length ? "Try another search or filter." : "Add a student, or paste a list of names and student numbers. Each student gets a unique code to collect their own ticket."} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3">
                  <tr><th className="px-5 py-3">Student</th><th className="px-3 py-3">Programme</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Progress</th><th className="px-3 py-3">Ticket no.</th><th className="px-5 py-3 text-right">Ticket</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((t) => { const stage = STAGE[stageOf(t)]; return (
                    <tr key={t.id} className="hover:bg-surface-2">
                      <td className="max-w-[16rem] px-5 py-3"><button onClick={() => setParams({ student: t.id, new: null })} className="block max-w-full truncate text-left text-[13px] font-bold text-ink hover:text-accent-ink">{t.holder_name}</button><p className="text-ink-3">{t.student_number ?? "No student number"}</p></td>
                      <td className="max-w-[12rem] px-3 py-3 text-ink-2"><span className="block truncate">{t.programme ?? <span className="text-ink-3">—</span>}</span></td>
                      <td className="max-w-[14rem] px-3 py-3 text-ink-2"><span className="block truncate">{t.holder_email ?? <span className="text-ink-3">No email</span>}</span><span className="block truncate text-ink-3">{t.holder_phone ?? "No phone"}</span></td>
                      <td className="px-3 py-3"><div className="flex flex-wrap items-center gap-1.5"><Badge tone={stage.tone} icon={stage.icon}>{stage.label}</Badge>{t.status === "checked_in" && <Badge tone={TICKET_STATUS.checked_in.tone} icon={TICKET_STATUS.checked_in.icon}>Checked in</Badge>}</div></td>
                      <td className="px-3 py-3 font-mono text-[12px] font-semibold text-ink-2">{t.code}</td>
                      <td className="px-5 py-2 text-right"><div className="flex justify-end gap-1.5">
                        <Button variant="ghost" size="icon-sm" aria-label={`Copy collection link for ${t.holder_name}`} onClick={() => copyText(link(t), "Link")}><Link2 /></Button>
                        <TicketDownload ticket={printed(t)} event={event} />
                      </div></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {visible.map((t) => { const stage = STAGE[stageOf(t)]; return (
                <li key={t.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => setParams({ student: t.id, new: null })}>
                      <span className="block truncate text-[13px] font-bold text-ink">{t.holder_name}</span>
                      <span className="mt-0.5 block text-xs text-ink-3">{t.student_number ?? "No student number"} · <span className="font-mono font-semibold text-ink-2">{t.code}</span></span>
                    </button>
                    <TicketDownload ticket={printed(t)} event={event} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={stage.tone} icon={stage.icon} size="sm">{stage.label}</Badge>
                    {t.status === "checked_in" && <Badge tone="accent" icon={TICKET_STATUS.checked_in.icon} size="sm">Checked in</Badge>}
                    <Button variant="outline" size="sm" onClick={() => copyText(link(t), "Link")}><Link2 /> Copy link</Button>
                  </div>
                </li>
              ); })}
            </ul>
            {filtered.length > visible.length && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-ink-3">
                <span>Showing {formatNumber(visible.length)} of {formatNumber(filtered.length)}.</span>
                <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show more</Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── One student ──────────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setParams({ student: null }); }}>
        {selected && draftFace && (
          <SheetContent title={selected.holder_name ?? "Student"} description={`Student ticket ${selected.code} · issued ${formatDate(selected.created_at)}`}
            footer={manage ? (
              <>
                <Button variant="outline" onClick={() => setParams({ student: null })}>Close</Button>
                <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>
                <Button form="student-form" type="submit" loading={saving}>Save student</Button>
              </>
            ) : undefined}>
            <TicketPreview face={draftFace} event={event} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <StatusMenu value={selected.status} meta={TICKET_STATUS} order={TICKET_STATUS_ORDER} label={`Ticket ${selected.code}`} disabled={!manage} onChange={(next) => changeStatus(selected.id, next)} />
              <TicketDownload variant="button" ticket={printed(selected)} event={event} />
            </div>
            <dl className="mt-3 grid gap-1 text-xs text-ink-3">
              <div>Details {selected.details_completed_at ? `completed ${formatDate(selected.details_completed_at)}` : hasDetails(selected) ? "complete" : "not complete yet"}.</div>
              <div>{selected.download_count ? `Downloaded ${pluralize(selected.download_count, "time")}, first on ${formatDate(selected.first_downloaded_at ?? selected.created_at)}.` : "Not downloaded yet."}</div>
              {selected.status === "checked_in" && selected.checked_in_at && <div>Checked in {formatDate(selected.checked_in_at)}.</div>}
              {selected.status === "void" && <div className="font-medium text-critical-ink">This ticket is void and cannot be downloaded.</div>}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => copyText(link(selected), "Link")}><Link2 /> Copy link</Button>
              <Button variant="outline" size="sm" onClick={() => copyText(message(selected), "Message")}><MessageSquareText /> Copy message for WhatsApp</Button>
            </div>
            <StudentForm id="student-form" draft={draft} setDraft={setDraft} institutions={institutions} disabled={!manage} onSubmit={() => save({ ...draft, id: selected.id })} />
          </SheetContent>
        )}
      </Dialog>

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this student's ticket?" destructive confirmLabel="Delete ticket" loading={removing}
        description={`Ticket ${selected?.code ?? ""} will be removed for good and its code will stop working. To keep a record, mark it void instead.`}
        onConfirm={() => { if (selected) remove([selected.id]); }} />

      {/* ── Add one student ─────────────────────────────────────────────── */}
      <Dialog open={adding} onOpenChange={(open) => { if (!open) setParams({ new: null }); }}>
        <DialogContent title="Add a student" description="They get a complimentary ticket and a unique code. Anything you leave out, the student fills in themselves before they can download it."
          footer={<><Button variant="outline" onClick={() => setParams({ new: null })}>Cancel</Button><Button form="student-new-form" type="submit" loading={saving}>Issue ticket</Button></>}>
          <StudentForm id="student-new-form" draft={draft} setDraft={setDraft} institutions={institutions} onSubmit={() => save(draft)} compact />
        </DialogContent>
      </Dialog>

      {/* ── Paste a list ────────────────────────────────────────────────── */}
      <Dialog open={importing} onOpenChange={(open) => { if (!open) setParams({ new: null }); }}>
        <DialogContent title="Import a list of students" description="Paste one student per line, with the name and the student number. Numbering, dashes and commas are fine. Each student gets a ticket and a unique code."
          footer={<><Button variant="outline" onClick={() => setParams({ new: null })}>Cancel</Button><Button form="student-import-form" type="submit" loading={importingNow} disabled={!parsed.rows.length}>Issue {parsed.rows.length ? pluralize(parsed.rows.length, "ticket") : "tickets"}</Button></>}>
          <form id="student-import-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); bulkImport({ institution_id: pasted.institution_id || defaultInstitution, text: pasted.text }); }}>
            <Field label="Institution" htmlFor="import-institution">
              <Select id="import-institution" value={pasted.institution_id || defaultInstitution} onChange={(e) => setPasted({ ...pasted, institution_id: e.target.value })}>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select>
            </Field>
            <Field label="Students" htmlFor="import-text" hint="Paste straight from WhatsApp, Word or a spreadsheet.">
              <Textarea id="import-text" rows={8} placeholder={"1. Ama Mensah 10000001\n2. Kofi Boateng - 10000002"} value={pasted.text} onChange={(e) => setPasted({ ...pasted, text: e.target.value })} />
            </Field>
            {pasted.text.trim() && (
              <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs">
                <p className="font-semibold text-ink">{pluralize(parsed.rows.length, "student")} ready{parsed.problems.length ? ` · ${pluralize(parsed.problems.length, "line")} need attention` : ""}</p>
                {parsed.problems.length > 0 && <ul className="mt-2 grid gap-1 text-critical-ink">{parsed.problems.slice(0, 8).map((p, i) => <li key={i}><span className="font-medium">{p.line}</span> — {p.reason}</li>)}</ul>}
                {parsed.rows.length > 0 && <ul className="mt-2 grid max-h-40 gap-0.5 overflow-y-auto text-ink-2">{parsed.rows.map((r) => <li key={r.number}>{r.name} <span className="text-ink-3">· {r.number}</span></li>)}</ul>}
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StudentForm({ id, draft, setDraft, institutions, onSubmit, disabled, compact }: { id: string; draft: Draft; setDraft: (d: Draft) => void; institutions: InstitutionLite[]; onSubmit: () => void; disabled?: boolean; compact?: boolean }) {
  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value });
  return (
    <form id={id} className={compact ? "grid gap-4" : "mt-5 grid gap-4 border-t border-line pt-4"} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <Field label="Full name" htmlFor={`${id}-name`} hint="Printed on the ticket."><Input id={`${id}-name`} required disabled={disabled} autoComplete="off" value={draft.holder_name} onChange={set("holder_name")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Student number" htmlFor={`${id}-number`}><Input id={`${id}-number`} required disabled={disabled} inputMode="numeric" autoComplete="off" value={draft.student_number} onChange={set("student_number")} /></Field>
        <Field label="Institution" htmlFor={`${id}-institution`}>
          <Select id={`${id}-institution`} required disabled={disabled} value={draft.institution_id} onChange={set("institution_id")}>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select>
        </Field>
      </div>
      <Field label="Programme" htmlFor={`${id}-programme`} optional hint="The student fills this in if you leave it empty."><Input id={`${id}-programme`} disabled={disabled} value={draft.programme} onChange={set("programme")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor={`${id}-email`} optional><Input id={`${id}-email`} type="email" disabled={disabled} value={draft.holder_email} onChange={set("holder_email")} /></Field>
        <Field label="Phone" htmlFor={`${id}-phone`} optional><Input id={`${id}-phone`} type="tel" disabled={disabled} value={draft.holder_phone} onChange={set("holder_phone")} /></Field>
      </div>
      {!compact && <Field label="Notes" htmlFor={`${id}-notes`} optional hint="For the team only."><Textarea id={`${id}-notes`} disabled={disabled} value={draft.notes} onChange={set("notes")} /></Field>}
    </form>
  );
}
