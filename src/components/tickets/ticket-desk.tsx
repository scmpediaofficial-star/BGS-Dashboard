"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download, FileImage, FileSpreadsheet, FileText, MicVocal, Plus, Search, Sparkles, Ticket, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { addProgrammeDelegates, deleteTickets, issueComplimentary, saveTicket, setTicketStatus } from "@/app/(app)/tickets/actions";
import { useViewer } from "@/components/shell/session-context";
import { StatusMenu } from "@/components/shared/status-menu";
import { useAction } from "@/components/shared/use-action";
import { paintTicket, saveBlob, ticketFileName, ticketsPdf, ticketsPngZip, TICKET_H, TICKET_W, type TicketEvent, type TicketFace } from "@/components/tickets/ticket-art";
import { TicketDownload } from "@/components/tickets/ticket-download";
import { toFace, type TicketRow } from "@/components/tickets/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent, SheetContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, FilterChip } from "@/components/ui/misc";
import { DELEGATE_ROLES, TICKET_KIND, TICKET_KIND_ORDER, TICKET_STATUS, TICKET_STATUS_ORDER, type TicketKind, type TicketStatus } from "@/lib/domain";
import { formatDate, formatNumber, isoDay, pluralize, toCsv } from "@/lib/utils";

type StatusFilter = "live" | "all" | TicketStatus;
const STATUS_FILTER: { value: StatusFilter; label: string }[] = [
  { value: "live", label: "Valid and checked in" },
  { value: "valid", label: "Valid only" },
  { value: "checked_in", label: "Checked in only" },
  { value: "void", label: "Void only" },
  { value: "all", label: "Every status" },
];
const PAGE = 100;

type Draft = { kind: "delegate" | "complimentary"; holder_name: string; holder_email: string; holder_phone: string; organization: string; role_label: string; notes: string };
const blankDraft: Draft = { kind: "delegate", holder_name: "", holder_email: "", holder_phone: "", organization: "", role_label: "Panel member", notes: "" };
const draftOf = (t: TicketRow): Draft => ({
  kind: t.kind === "complimentary" ? "complimentary" : "delegate", holder_name: t.holder_name ?? "", holder_email: t.holder_email ?? "", holder_phone: t.holder_phone ?? "",
  organization: t.organization ?? "", role_label: t.role_label ?? "", notes: t.notes ?? "",
});

/** What the "type" column says: delegates show how they are taking part. */
const kindLabel = (t: Pick<TicketRow, "kind" | "role_label">) => (t.kind === "delegate" && t.role_label ? t.role_label : TICKET_KIND[t.kind].label);
const holderLabel = (t: Pick<TicketRow, "kind" | "holder_name">) => t.holder_name ?? (t.kind === "complimentary" ? "Not assigned yet" : "No name");

/** Every issued ticket: find one, hand it out, download it, check it in. */
export function TicketDesk({ tickets, event, programmePending }: { tickets: TicketRow[]; event: TicketEvent; programmePending: number }) {
  const { can } = useViewer();
  const manage = can("tickets.manage");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const kind = (TICKET_KIND_ORDER as string[]).includes(params.get("kind") ?? "") ? (params.get("kind") as TicketKind) : "all";
  const openId = params.get("ticket");
  const adding = params.get("new") === "delegate";
  const batching = params.get("new") === "complimentary";
  const selected = tickets.find((t) => t.id === openId);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("live");
  const [shown, setShown] = useState(PAGE);
  const [progress, setProgress] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [batch, setBatch] = useState({ count: "50", notes: "" });

  // The form edits a copy; it is re-seeded whenever a different ticket (or the "new" dialog) is opened.
  const draftKey = openId ?? (adding ? "new" : "");
  const [draftState, setDraftState] = useState<{ key: string; values: Draft }>({ key: "", values: blankDraft });
  const draft = draftState.key === draftKey ? draftState.values : selected ? draftOf(selected) : blankDraft;
  const setDraft = (values: Draft) => setDraftState({ key: draftKey, values });

  const [save, saving] = useAction(saveTicket, { success: "Ticket saved", onSuccess: ({ id }) => setParams({ new: null, ticket: id }) });
  const [changeStatus] = useAction(setTicketStatus, { success: "Ticket updated" });
  const [remove, removing] = useAction(deleteTickets, { success: "Ticket deleted", onSuccess: () => { setConfirmDelete(false); setParams({ ticket: null }); } });
  const [issue, issuing] = useAction(issueComplimentary, {
    success: ({ count }) => `${pluralize(count, "complimentary ticket")} issued`,
    onSuccess: () => { setBatch({ count: "50", notes: "" }); setParams({ new: null, kind: "complimentary" }); },
  });
  const [pullProgramme, pulling] = useAction(addProgrammeDelegates, {
    success: ({ count }) => (count ? `${pluralize(count, "delegate")} added from the programme` : "Everyone on the programme already has a ticket"),
    onSuccess: () => setParams({ kind: "delegate" }),
  });

  const inStatus = useCallback((t: TicketRow) => (status === "all" ? true : status === "live" ? t.status !== "void" : t.status === status), [status]);
  const counts = useMemo(() => {
    const base = tickets.filter(inStatus);
    return { all: base.length, ...Object.fromEntries(TICKET_KIND_ORDER.map((k) => [k, base.filter((t) => t.kind === k).length])) } as Record<"all" | TicketKind, number>;
  }, [tickets, inStatus]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tickets.filter((t) =>
      (kind === "all" || t.kind === kind) && inStatus(t) &&
      (!needle || `${t.code} ${t.code.replace(/-/g, "")} ${t.holder_name ?? ""} ${t.organization ?? ""} ${t.holder_email ?? ""} ${t.role_label ?? ""} ${t.notes ?? ""}`.toLowerCase().includes(needle)));
  }, [tickets, kind, inStatus, query]);
  const visible = filtered.slice(0, shown);

  const bulkName = `BGS-2026-${kind === "all" ? "" : `${kind === "paid" ? "paid" : kind}-`}tickets-${filtered.length}`;
  async function bulk(format: "pdf" | "png") {
    if (!filtered.length || progress) return;
    const faces = filtered.map(toFace);
    const label = (done: number) => `Preparing ${formatNumber(done)} of ${formatNumber(faces.length)}…`;
    setProgress(label(0));
    try {
      const report = (done: number) => setProgress(label(done));
      const blob = format === "pdf" ? await ticketsPdf(faces, event, report) : await ticketsPngZip(faces, event, (face: TicketFace) => `${ticketFileName(face)}.png`, report);
      saveBlob(blob, `${bulkName}.${format === "pdf" ? "pdf" : "zip"}`);
      toast.success(`${pluralize(faces.length, "ticket")} saved`);
    } catch (error) {
      console.error("[tickets]", error);
      toast.error("The tickets could not be created. Check your connection and try again.");
    } finally {
      setProgress(null);
    }
  }
  function exportCsv() {
    const csv = toCsv([["Ticket no.", "Type", "Name", "Organisation", "Role", "Status", "Email", "Phone", "Notes", "Issued"],
      ...filtered.map((t) => [t.code, TICKET_KIND[t.kind].label, t.holder_name, t.organization, t.role_label, TICKET_STATUS[t.status].label, t.holder_email, t.holder_phone, t.notes, isoDay(t.created_at)])]);
    saveBlob(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }), `${bulkName}-${isoDay()}.csv`);
  }

  const editable = manage;
  const face: TicketFace | null = selected
    ? { code: selected.code, kind: selected.kind, name: draft.holder_name.trim() || null, organization: draft.organization.trim() || null, roleLabel: selected.kind === "delegate" ? draft.role_label.trim() || null : null }
    : null;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search tickets" placeholder="Search by ticket no., name or organisation…" className="pl-9" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-52"><Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setShown(PAGE); }}>{STATUS_FILTER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" loading={!!progress} disabled={!filtered.length}>{!progress && <Download />} {progress ?? "Download"} {!progress && <ChevronDown aria-hidden className="opacity-60" />}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{pluralize(filtered.length, "ticket")} shown</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => bulk("pdf")}><FileText aria-hidden /> One PDF, a ticket per page</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => bulk("png")}><FileImage aria-hidden /> PNG images in a .zip</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={exportCsv}><FileSpreadsheet aria-hidden /> List as a spreadsheet (CSV)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {manage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button><Plus /> Issue tickets <ChevronDown aria-hidden className="opacity-70" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => { setDraftState({ key: "new", values: blankDraft }); setParams({ new: "delegate", ticket: null }); }}><UserPlus aria-hidden /> Add a delegate or named guest</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setParams({ new: "complimentary", ticket: null })}><Sparkles aria-hidden /> Blank complimentary tickets</DropdownMenuItem>
                <DropdownMenuItem disabled={pulling} onSelect={() => pullProgramme()}><MicVocal aria-hidden /> Add panel members and moderators{programmePending ? ` (${programmePending})` : ""}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/tickets?tab=sales&new=1"><Ticket aria-hidden /> Record a paid sale</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="scroll-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <FilterChip active={kind === "all"} count={counts.all} onClick={() => { setParams({ kind: null }); setShown(PAGE); }}>All tickets</FilterChip>
        {TICKET_KIND_ORDER.map((k) => (
          <FilterChip key={k} active={kind === k} count={counts[k]} onClick={() => { setParams({ kind: k }); setShown(PAGE); }}>{k === "paid" ? "Ticket holders" : k === "delegate" ? "Delegates" : "Complimentary"}</FilterChip>
        ))}
      </div>

      {manage && programmePending > 0 && (kind === "all" || kind === "delegate") && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[13px] text-ink-2"><strong className="font-bold text-ink">{pluralize(programmePending, "confirmed panel member or moderator", "confirmed panel members and moderators")}</strong> on the programme {programmePending === 1 ? "has" : "have"} no delegate ticket yet.</p>
          <Button variant="outline" size="sm" loading={pulling} onClick={() => pullProgramme()}><MicVocal /> Add them</Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Ticket} title={tickets.length ? "No tickets match" : "No tickets issued yet"}
            description={tickets.length ? "Try another search, type or status." : "Tickets appear here as soon as a sale is paid. Delegates and complimentary tickets are issued from “Issue tickets”."} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3">
                  <tr><th className="px-5 py-3">Ticket no.</th><th className="px-3 py-3">Holder</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Issued</th><th className="px-5 py-3 text-right">E-ticket</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-2">
                      <td className="px-5 py-3"><button onClick={() => setParams({ ticket: t.id, new: null })} className="font-mono text-[13px] font-bold text-ink hover:text-accent-ink">{t.code}</button></td>
                      <td className="max-w-[18rem] px-3 py-3"><p className={t.holder_name ? "truncate font-semibold text-ink" : "truncate text-ink-3"}>{holderLabel(t)}</p>{t.organization && <p className="truncate text-ink-3">{t.organization}</p>}</td>
                      <td className="px-3 py-3"><Badge tone={TICKET_KIND[t.kind].tone} icon={TICKET_KIND[t.kind].icon}>{kindLabel(t)}</Badge></td>
                      <td className="px-3 py-3"><StatusMenu value={t.status} meta={TICKET_STATUS} order={TICKET_STATUS_ORDER} label={`Ticket ${t.code}`} disabled={!manage} onChange={(next) => changeStatus(t.id, next)} /></td>
                      <td className="px-3 py-3 text-ink-3">{formatDate(t.created_at)}</td>
                      <td className="px-5 py-2 text-right">{t.status === "void" ? <span className="text-ink-3">—</span> : <TicketDownload ticket={t} event={event} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {visible.map((t) => (
                <li key={t.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => setParams({ ticket: t.id, new: null })}>
                      <span className={t.holder_name ? "block truncate text-[13px] font-bold text-ink" : "block truncate text-[13px] text-ink-3"}>{holderLabel(t)}</span>
                      <span className="mt-0.5 block font-mono text-xs font-semibold text-ink-2">{t.code}</span>
                    </button>
                    {t.status !== "void" && <TicketDownload ticket={t} event={event} />}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={TICKET_KIND[t.kind].tone} icon={TICKET_KIND[t.kind].icon} size="sm">{kindLabel(t)}</Badge>
                    <StatusMenu size="sm" value={t.status} meta={TICKET_STATUS} order={TICKET_STATUS_ORDER} label={`Ticket ${t.code}`} disabled={!manage} onChange={(next) => changeStatus(t.id, next)} />
                  </div>
                </li>
              ))}
            </ul>
            {filtered.length > visible.length && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-ink-3">
                <span>Showing {formatNumber(visible.length)} of {formatNumber(filtered.length)}. Downloads include all {formatNumber(filtered.length)}.</span>
                <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show more</Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── One ticket ───────────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setParams({ ticket: null }); }}>
        {selected && face && (
          <SheetContent
            title={`Ticket ${selected.code}`}
            description={`${kindLabel(selected)} · issued ${formatDate(selected.created_at)}`}
            footer={editable ? (
              <>
                <Button variant="outline" onClick={() => setParams({ ticket: null })}>Close</Button>
                {!selected.sale_id && <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>}
                <Button form="ticket-form" type="submit" loading={saving}>Save ticket</Button>
              </>
            ) : undefined}
          >
            <TicketPreview face={face} event={event} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <StatusMenu value={selected.status} meta={TICKET_STATUS} order={TICKET_STATUS_ORDER} label={`Ticket ${selected.code}`} disabled={!manage} onChange={(next) => changeStatus(selected.id, next)} />
              <TicketDownload variant="button" ticket={{ code: face.code, kind: face.kind, holder_name: face.name, organization: face.organization, role_label: face.roleLabel }} event={event} />
            </div>
            {selected.status === "checked_in" && selected.checked_in_at && <p className="mt-2 text-xs text-ink-3">Checked in {formatDate(selected.checked_in_at)}.</p>}
            {selected.status === "void" && <p className="mt-2 text-xs font-medium text-critical-ink">This ticket is void and should not be admitted.</p>}

            <form id="ticket-form" className="mt-5 grid gap-4 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); save({ ...draft, id: selected.id }); }}>
              <Field label="Name on the ticket" htmlFor="ticket-name" optional={selected.kind === "complimentary"} hint={selected.kind === "complimentary" ? "Leave empty to keep it a blank complimentary ticket." : undefined}>
                <Input id="ticket-name" disabled={!editable} required={selected.kind !== "complimentary"} value={draft.holder_name} onChange={(e) => setDraft({ ...draft, holder_name: e.target.value })} />
              </Field>
              {selected.kind === "delegate" && <RoleField id="ticket-role" disabled={!editable} value={draft.role_label} onChange={(role_label) => setDraft({ ...draft, role_label })} />}
              <Field label="Organisation" htmlFor="ticket-org" optional><Input id="ticket-org" disabled={!editable} value={draft.organization} onChange={(e) => setDraft({ ...draft, organization: e.target.value })} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="ticket-email" optional><Input id="ticket-email" type="email" disabled={!editable} value={draft.holder_email} onChange={(e) => setDraft({ ...draft, holder_email: e.target.value })} /></Field>
                <Field label="Phone" htmlFor="ticket-phone" optional><Input id="ticket-phone" disabled={!editable} value={draft.holder_phone} onChange={(e) => setDraft({ ...draft, holder_phone: e.target.value })} /></Field>
              </div>
              <Field label="Notes" htmlFor="ticket-notes" optional hint="For the team only. Not printed on the ticket."><Textarea id="ticket-notes" disabled={!editable} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
            </form>
            {selected.sale_id && <p className="mt-4 text-xs text-ink-3">Issued from a sale. <Link className="font-semibold text-accent-ink hover:underline" href={`/tickets?tab=sales&item=${selected.sale_id}`}>Open the sale</Link> to change the payment or the number of tickets.</p>}
          </SheetContent>
        )}
      </Dialog>

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this ticket?" destructive confirmLabel="Delete ticket" loading={removing}
        description={`Ticket ${selected?.code ?? ""} will be removed for good and its number will stop working. To keep a record, mark it void instead.`}
        onConfirm={() => { if (selected) remove([selected.id]); }} />

      {/* ── Add a delegate or a named guest ──────────────────────────────── */}
      <Dialog open={adding} onOpenChange={(open) => { if (!open) setParams({ new: null }); }}>
        <DialogContent title="Add a delegate or named guest" description="They get a ticket with their name and a unique number straight away."
          footer={<><Button variant="outline" onClick={() => setParams({ new: null })}>Cancel</Button><Button form="delegate-form" type="submit" loading={saving}>Issue ticket</Button></>}>
          <form id="delegate-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save(draft); }}>
            <Field label="Ticket type" htmlFor="delegate-kind">
              <Select id="delegate-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}>
                <option value="delegate">Delegate — chairperson, speaker, panel member, guest</option>
                <option value="complimentary">Complimentary — a named guest admitted free</option>
              </Select>
            </Field>
            <Field label="Full name" htmlFor="delegate-name"><Input id="delegate-name" required autoComplete="off" value={draft.holder_name} onChange={(e) => setDraft({ ...draft, holder_name: e.target.value })} /></Field>
            {draft.kind === "delegate" && <RoleField id="delegate-role" value={draft.role_label} onChange={(role_label) => setDraft({ ...draft, role_label })} />}
            <Field label="Organisation" htmlFor="delegate-org" optional><Input id="delegate-org" value={draft.organization} onChange={(e) => setDraft({ ...draft, organization: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="delegate-email" optional><Input id="delegate-email" type="email" value={draft.holder_email} onChange={(e) => setDraft({ ...draft, holder_email: e.target.value })} /></Field>
              <Field label="Phone" htmlFor="delegate-phone" optional><Input id="delegate-phone" value={draft.holder_phone} onChange={(e) => setDraft({ ...draft, holder_phone: e.target.value })} /></Field>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Blank complimentary tickets ──────────────────────────────────── */}
      <Dialog open={batching} onOpenChange={(open) => { if (!open) setParams({ new: null }); }}>
        <DialogContent size="sm" title="Blank complimentary tickets" description="Each one says “Complimentary” and carries its own number. Add a name later if you want to."
          footer={<><Button variant="outline" onClick={() => setParams({ new: null })}>Cancel</Button><Button form="batch-form" type="submit" loading={issuing}>Issue tickets</Button></>}>
          <form id="batch-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); issue({ count: Number(batch.count), notes: batch.notes }); }}>
            <Field label="How many" htmlFor="batch-count"><Input id="batch-count" type="number" inputMode="numeric" min="1" max="1000" required value={batch.count} onChange={(e) => setBatch({ ...batch, count: e.target.value })} /></Field>
            <Field label="Note" htmlFor="batch-note" optional hint="For the team, e.g. who the batch is for. Not printed."><Input id="batch-note" value={batch.notes} onChange={(e) => setBatch({ ...batch, notes: e.target.value })} /></Field>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoleField({ id, value, onChange, disabled }: { id: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <Field label="Role at the summit" htmlFor={id} optional hint="Printed above the name. Pick one or type your own.">
      <Input id={id} list={`${id}-options`} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={`${id}-options`}>{DELEGATE_ROLES.map((role) => <option key={role} value={role} />)}</datalist>
    </Field>
  );
}

/** The ticket exactly as it will download, redrawn as the form changes. */
function TicketPreview({ face, event }: { face: TicketFace; event: TicketEvent }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const { code, kind, name, organization, roleLabel } = face;
  const { dateLine, venueLine, admitLabel } = event;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const canvas = ref.current;
      if (!canvas) return;
      paintTicket(canvas, { code, kind, name, organization, roleLabel }, { dateLine, venueLine, admitLabel }).then(
        () => { if (!cancelled) setFailed(false); },
        () => { if (!cancelled) setFailed(true); },
      );
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [code, kind, name, organization, roleLabel, dateLine, venueLine, admitLabel]);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
      <canvas ref={ref} width={TICKET_W} height={TICKET_H} role="img" aria-label={`Ticket ${code}${name ? ` for ${name}` : ""}`} className="block h-auto w-full" />
      {failed && <p className="px-3 py-2 text-xs text-critical-ink">The preview could not be drawn. Check your connection.</p>}
    </div>
  );
}
