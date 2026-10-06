"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Copy, Download, MessageSquareText, Play, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { continueCampaign, resendFailed } from "@/app/(app)/sms/actions";
import { useAction } from "@/components/shared/use-action";
import { BlastProgress, useBlastDriver } from "@/components/sms/sms-progress";
import { GROUPS, SOURCE_LABEL, type Campaign, type GroupKey, type Message, type Source } from "@/components/sms/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, SheetContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, FilterChip } from "@/components/ui/misc";
import { SMS_STATUS, smsStatus } from "@/lib/domain";
import { displayPhone } from "@/lib/sms/text";
import { formatDateTime, formatNumber, isoDay, pluralize, timeAgo, toCsv, truncate } from "@/lib/utils";

const PAGE = 50;
/** A blast still "sending" with no progress for this long has nobody driving it. */
const STALL_MS = 3 * 60_000;
type StatusFilter = "all" | "sent" | "partial" | "failed" | "sending" | "stalled";
type MessageFilter = "all" | "sent" | "queued" | "failed" | "skipped";
const MESSAGE_FILTERS: { value: MessageFilter; label: string }[] = [
  { value: "all", label: "Everyone" }, { value: "sent", label: "Sent" }, { value: "queued", label: "Queued" }, { value: "failed", label: "Rejected" }, { value: "skipped", label: "Skipped" },
];

const listLabels = (c: Campaign) => c.audience.map((g) => GROUPS[g as GroupKey]?.label ?? g);
const queuedOf = (c: Campaign) => Math.max(0, c.recipients - c.sent - c.failed);
/** "sending" only counts while someone is driving it; otherwise it is stalled and can be resumed. */
const effectiveStatus = (c: Campaign) => (c.status === "sending" && Date.now() - new Date(c.last_activity_at ?? c.created_at).getTime() > STALL_MS ? "stalled" : c.status);
/** Numbers claimed by a round that is in flight read as queued: they have not been answered yet. */
const messageState = (m: Message) => (m.status === "sending" ? "queued" : m.status);

export function SmsHistory({ campaigns, openId, openMessages, canSend }: { campaigns: Campaign[]; openId: string | null; openMessages: Message[]; canSend: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [list, setList] = useState<string>("all");
  const [shown, setShown] = useState(PAGE);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>("all");
  const [messageQuery, setMessageQuery] = useState("");
  const [messageShown, setMessageShown] = useState(PAGE * 2);
  const [confirmResume, setConfirmResume] = useState(false);
  const blast = useBlastDriver();
  const [resend, resending] = useAction(resendFailed, { silent: true, onSuccess: (first) => blast.drive(first, (done) => open(done.id)) });
  const [next, resuming] = useAction(continueCampaign, { silent: true, onSuccess: (first) => { setConfirmResume(false); blast.drive(first); } });
  const busy = resending || resuming || blast.running;

  function open(id: string | null) {
    const q = new URLSearchParams(params.toString());
    q.set("tab", "history");
    if (id) q.set("campaign", id); else q.delete("campaign");
    router.replace(`${pathname}?${q}`, { scroll: false });
    setMessageFilter("all"); setMessageQuery(""); setMessageShown(PAGE * 2);
  }

  const lists = useMemo(() => [...new Set(campaigns.flatMap((c) => c.audience))], [campaigns]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return campaigns.filter((c) => (status === "all" || effectiveStatus(c) === status) && (list === "all" || c.audience.includes(list)) &&
      (!needle || `${c.message} ${c.sender?.full_name ?? ""} ${listLabels(c).join(" ")}`.toLowerCase().includes(needle)));
  }, [campaigns, query, status, list]);
  const visible = filtered.slice(0, shown);

  const selected = campaigns.find((c) => c.id === openId) ?? null;
  const selectedStatus = selected ? effectiveStatus(selected) : null;
  const counts = useMemo(() => {
    const c = { all: openMessages.length, sent: 0, queued: 0, failed: 0, skipped: 0 };
    for (const m of openMessages) c[messageState(m) as "sent" | "queued" | "failed" | "skipped"] += 1;
    return c;
  }, [openMessages]);
  const messages = useMemo(() => {
    const needle = messageQuery.trim().toLowerCase();
    return openMessages.filter((m) => (messageFilter === "all" || messageState(m) === messageFilter) && (!needle || `${m.name ?? ""} ${m.to_phone} ${m.error ?? ""}`.toLowerCase().includes(needle)));
  }, [openMessages, messageFilter, messageQuery]);

  function download(which: MessageFilter) {
    if (!selected) return;
    const rows = openMessages.filter((m) => which === "all" || messageState(m) === which);
    if (!rows.length) { toast.error("Nothing to download for that status."); return; }
    const csv = toCsv([["Name", "Phone", "List", "Status", "Gateway code", "Reason"], ...rows.map((m) => [m.name, m.to_phone, SOURCE_LABEL[m.source as Source] ?? m.source, smsStatus(messageState(m)).label, m.code, m.error])]);
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `BGS-sms-${isoDay(selected.created_at)}-${which === "all" ? "everyone" : which === "failed" ? "rejected" : which}.csv` });
    a.click(); URL.revokeObjectURL(url);
    toast.success(`${pluralize(rows.length, "number")} saved as CSV`);
  }
  function copyNumbers(which: "failed" | "queued") {
    const text = openMessages.filter((m) => messageState(m) === which).map((m) => m.to_phone).join("\n");
    navigator.clipboard.writeText(text).then(() => toast.success(`${which === "failed" ? "Rejected" : "Queued"} numbers copied`), () => toast.error("Copying is blocked in this browser."));
  }

  const Counts = ({ c, size }: { c: Campaign; size?: "sm" }) => (
    <span className={`inline-flex flex-wrap items-center gap-x-2 ${size === "sm" ? "text-xs" : ""}`}>
      <span className="font-semibold text-good-ink">{formatNumber(c.sent)} sent</span>
      {queuedOf(c) > 0 && <span className="text-ink-3">· {formatNumber(queuedOf(c))} queued</span>}
      {c.failed > 0 && <span className="text-critical-ink">· {formatNumber(c.failed)} rejected</span>}
    </span>
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search sent messages" placeholder="Search the wording or who sent it…" className="pl-9" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-44"><Select aria-label="Filter by outcome" value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setShown(PAGE); }}>
            <option value="all">Every outcome</option><option value="sent">Sent in full</option><option value="partial">Partly sent</option><option value="failed">Failed</option><option value="sending">Sending now</option><option value="stalled">Stalled — needs resuming</option>
          </Select></div>
          {lists.length > 0 && <div className="w-full sm:w-48"><Select aria-label="Filter by list" value={list} onChange={(e) => { setList(e.target.value); setShown(PAGE); }}>
            <option value="all">Every list</option>{lists.map((g) => <option key={g} value={g}>{GROUPS[g as GroupKey]?.label ?? g}</option>)}
          </Select></div>}
        </div>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={MessageSquareText} title={campaigns.length ? "No messages match" : "Nothing sent yet"} description={campaigns.length ? "Try another search, outcome or list." : "Every blast you send appears here, with the result for each number."} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3">
                  <tr><th className="px-5 py-3">Message</th><th className="px-3 py-3">Sent to</th><th className="px-3 py-3">Sent · queued · rejected</th><th className="px-3 py-3">Outcome</th><th className="px-3 py-3">When</th><th className="px-5 py-3">By</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((c) => { const meta = smsStatus(effectiveStatus(c)); return (
                    <tr key={c.id} className="hover:bg-surface-2">
                      <td className="max-w-[24rem] px-5 py-3"><button onClick={() => open(c.id)} className="block w-full truncate text-left text-[13px] font-semibold text-ink hover:text-accent-ink">{truncate(c.message, 100)}</button></td>
                      <td className="max-w-[13rem] px-3 py-3 text-ink-2"><p className="truncate">{listLabels(c).join(", ") || "Typed or uploaded numbers"}</p><p className="text-ink-3">{formatNumber(c.recipients)} people</p></td>
                      <td className="px-3 py-3"><Counts c={c} /></td>
                      <td className="px-3 py-3"><Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge></td>
                      <td className="px-3 py-3 text-ink-3"><time dateTime={c.created_at} title={formatDateTime(c.created_at)}>{timeAgo(c.created_at)}</time></td>
                      <td className="px-5 py-3 text-ink-3">{c.sender?.full_name ?? "—"}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {visible.map((c) => { const meta = smsStatus(effectiveStatus(c)); return (
                <li key={c.id} className="p-4">
                  <button className="block w-full text-left" onClick={() => open(c.id)}>
                    <span className="block text-[13px] font-semibold leading-snug text-ink">{truncate(c.message, 120)}</span>
                    <span className="mt-1 block text-xs text-ink-3">{listLabels(c).join(", ") || "Typed or uploaded numbers"} · {formatNumber(c.recipients)} people · {timeAgo(c.created_at)}</span>
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><Badge tone={meta.tone} icon={meta.icon} size="sm">{meta.label}</Badge><Counts c={c} size="sm" /></div>
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

      {/* ── One blast ────────────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o && !busy) open(null); }}>
        {selected && selectedStatus && (() => { const meta = smsStatus(selectedStatus); const queued = queuedOf(selected); return (
          <SheetContent title="Sent message" description={`${formatDateTime(selected.created_at)}${selected.sender?.full_name ? ` · by ${selected.sender.full_name}` : ""} · from ${selected.sender_id}`}
            footer={<>
              <Button variant="outline" onClick={() => open(null)} disabled={busy}>Close</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" disabled={!openMessages.length}><Download /> CSV <ChevronDown aria-hidden className="opacity-60" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Download as a spreadsheet</DropdownMenuLabel>
                  {MESSAGE_FILTERS.map((f) => <DropdownMenuItem key={f.value} disabled={f.value !== "all" && counts[f.value] === 0} onSelect={() => download(f.value)}>{f.label} ({formatNumber(f.value === "all" ? counts.all : counts[f.value])})</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
              {canSend && <Button asChild variant="outline"><Link href={`/sms?message=${encodeURIComponent(selected.message)}`}><Copy /> Use again</Link></Button>}
              {canSend && (selectedStatus === "stalled" || selectedStatus === "sending") && queued > 0 && <Button loading={resuming || blast.running} onClick={() => setConfirmResume(true)}><Play /> Resume ({formatNumber(queued)} queued)</Button>}
              {canSend && selected.failed > 0 && selectedStatus !== "sending" && selectedStatus !== "stalled" && <Button loading={resending} onClick={() => resend(selected.id)}><RotateCcw /> Resend to {pluralize(selected.failed, "rejected number")}</Button>}
            </>}>
            <div className="rounded-xl border border-line bg-surface-2 p-3"><p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{selected.message}</p></div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
              <span className="text-xs text-ink-2">{formatNumber(selected.recipients)} people · {selected.segments} {selected.segments === 1 ? "part" : "parts"} each</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-good-soft px-2 py-2"><p className="text-lg font-extrabold leading-none text-good-ink">{formatNumber(selected.sent)}</p><p className="mt-1 text-[11px] text-good-ink">sent</p></div>
              <div className="rounded-xl bg-surface-2 px-2 py-2"><p className="text-lg font-extrabold leading-none text-ink">{formatNumber(queued)}</p><p className="mt-1 text-[11px] text-ink-3">queued</p></div>
              <div className={`rounded-xl px-2 py-2 ${selected.failed ? "bg-critical-soft" : "bg-surface-2"}`}><p className={`text-lg font-extrabold leading-none ${selected.failed ? "text-critical-ink" : "text-ink"}`}>{formatNumber(selected.failed)}</p><p className={`mt-1 text-[11px] ${selected.failed ? "text-critical-ink" : "text-ink-3"}`}>rejected</p></div>
            </div>
            <p className="mt-2 text-xs text-ink-3">Lists: {listLabels(selected).join(", ") || "typed or uploaded numbers only"}. <strong className="font-semibold text-ink-2">Sent</strong> means the gateway accepted the message; <strong className="font-semibold text-ink-2">rejected</strong> means it refused it, with the reason on each number.</p>
            {selectedStatus === "stalled" && <p className="mt-2 rounded-lg bg-serious-soft px-3 py-2 text-xs text-serious-ink">This blast stopped before everyone was reached — the server’s time ran out or the page was closed — and {pluralize(queued, "number")} never got an answer. Resume sends only to those still queued.</p>}
            {selectedStatus === "sending" && !blast.running && queued > 0 && <p className="mt-2 text-xs text-ink-3">Another browser is sending this blast right now. If the count stops moving for a few minutes, it can be resumed here.</p>}
            {selected.error && selectedStatus !== "stalled" && <p className="mt-2 text-xs text-critical-ink">{selected.error}</p>}
            {canSend && (counts.failed > 0 || counts.queued > 0) && (
              <p className="mt-2 flex flex-wrap gap-3 text-xs">
                {counts.failed > 0 && <button className="font-semibold text-accent-ink hover:underline" onClick={() => copyNumbers("failed")}>Copy the rejected numbers</button>}
                {counts.queued > 0 && <button className="font-semibold text-accent-ink hover:underline" onClick={() => copyNumbers("queued")}>Copy the queued numbers</button>}
              </p>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <div className="scroll-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                {MESSAGE_FILTERS.filter((f) => f.value === "all" || f.value === "sent" || f.value === "failed" || counts[f.value] > 0).map((f) => (
                  <FilterChip key={f.value} active={messageFilter === f.value} count={f.value === "all" ? counts.all : counts[f.value]} onClick={() => setMessageFilter(f.value)}>{f.label}</FilterChip>
                ))}
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input aria-label="Search recipients" placeholder="Name or number…" className="pl-9" value={messageQuery} onChange={(e) => setMessageQuery(e.target.value)} />
              </div>
              {messages.length === 0 ? <p className="mt-4 text-xs text-ink-3">{openMessages.length ? "Nobody matches." : "Recipient details are loading…"}</p> : (
                <ul className="mt-2 divide-y divide-line">
                  {messages.slice(0, messageShown).map((m) => { const s = smsStatus(messageState(m)); return (
                    <li key={m.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13px] ${m.name ? "font-semibold text-ink" : "text-ink-3"}`}>{m.name ?? "No name"}</p>
                        <p className="truncate text-xs text-ink-3"><span className="font-mono">{displayPhone(m.to_phone)}</span> · {SOURCE_LABEL[m.source as Source] ?? m.source}{m.error ? <span className="text-critical-ink"> · {m.error}</span> : null}</p>
                      </div>
                      <Badge tone={s.tone} icon={s.icon} size="sm">{messageState(m) === "failed" ? "Rejected" : s.label}</Badge>
                    </li>
                  ); })}
                </ul>
              )}
              {messages.length > messageShown && <Button className="mt-2" variant="outline" size="sm" onClick={() => setMessageShown((n) => n + PAGE * 2)}>Show more ({formatNumber(messages.length - messageShown)} left)</Button>}
            </div>
          </SheetContent>
        ); })()}
      </Dialog>

      <ConfirmDialog open={confirmResume} onOpenChange={setConfirmResume} title={selected ? `Resume sending to ${pluralize(queuedOf(selected), "queued number")}?` : "Resume?"} confirmLabel="Resume" loading={resuming}
        description="Only numbers still queued are sent. A few of them may have reached the gateway just before the blast stopped and would get the message twice; compare with BulkSMSGH's delivery report if that matters."
        onConfirm={() => { if (selected) next(selected.id); }} />
      <BlastProgress progress={blast.progress} running={blast.running} onClose={blast.clear} />
      <span className="sr-only">{SMS_STATUS.queued.label}</span>
    </>
  );
}
