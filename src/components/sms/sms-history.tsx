"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, FileSpreadsheet, MessageSquareText, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { resendFailed } from "@/app/(app)/sms/actions";
import { useAction } from "@/components/shared/use-action";
import { GROUPS, SOURCE_LABEL, type Campaign, type GroupKey, type Message, type Source } from "@/components/sms/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, FilterChip } from "@/components/ui/misc";
import { SMS_STATUS, smsStatus } from "@/lib/domain";
import { displayPhone } from "@/lib/sms/text";
import { formatDateTime, formatNumber, isoDay, pluralize, timeAgo, toCsv, truncate } from "@/lib/utils";

const PAGE = 50;
const STALE_MS = 15 * 60_000;
type StatusFilter = "all" | "sent" | "partial" | "failed" | "sending";
type MessageFilter = "all" | "sent" | "failed" | "skipped";

const listLabels = (c: Campaign) => c.audience.map((g) => GROUPS[g as GroupKey]?.label ?? g);

/** A blast still "sending" long after it started was cut off (the server stopped) and will not finish. */
const effectiveStatus = (c: Campaign) => (c.status === "sending" && Date.now() - new Date(c.created_at).getTime() > STALE_MS ? "partial" : c.status);

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
  const [resend, resending] = useAction(resendFailed, { success: ({ sent, failed }) => (failed ? `Sent to ${formatNumber(sent)}; ${pluralize(failed, "number")} failed again` : `Sent to ${pluralize(sent, "person", "people")}`), onSuccess: ({ id }) => open(id) });

  function open(id: string | null) {
    const next = new URLSearchParams(params.toString());
    next.set("tab", "history");
    if (id) next.set("campaign", id); else next.delete("campaign");
    router.replace(`${pathname}?${next}`, { scroll: false });
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
  const messages = useMemo(() => {
    const needle = messageQuery.trim().toLowerCase();
    return openMessages.filter((m) => (messageFilter === "all" || m.status === messageFilter) && (!needle || `${m.name ?? ""} ${m.to_phone} ${m.error ?? ""}`.toLowerCase().includes(needle)));
  }, [openMessages, messageFilter, messageQuery]);
  const counts = useMemo(() => ({ all: openMessages.length, sent: openMessages.filter((m) => m.status === "sent").length, failed: openMessages.filter((m) => m.status === "failed").length, skipped: openMessages.filter((m) => m.status === "skipped").length }), [openMessages]);

  function exportCsv() {
    if (!selected) return;
    const csv = toCsv([["Name", "Phone", "List", "Status", "Code", "Error"], ...messages.map((m) => [m.name, m.to_phone, SOURCE_LABEL[m.source as Source] ?? m.source, smsStatus(m.status).label, m.code, m.error])]);
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `BGS-sms-${isoDay(selected.created_at)}-${messageFilter}.csv` });
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search sent messages" placeholder="Search the wording or who sent it…" className="pl-9" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-44"><Select aria-label="Filter by outcome" value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setShown(PAGE); }}>
            <option value="all">Every outcome</option><option value="sent">Sent in full</option><option value="partial">Partly sent</option><option value="failed">Failed</option><option value="sending">Still sending</option>
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
                  <tr><th className="px-5 py-3">Message</th><th className="px-3 py-3">Sent to</th><th className="px-3 py-3">Reached</th><th className="px-3 py-3">Outcome</th><th className="px-3 py-3">When</th><th className="px-5 py-3">By</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((c) => { const meta = smsStatus(effectiveStatus(c)); return (
                    <tr key={c.id} className="hover:bg-surface-2">
                      <td className="max-w-[26rem] px-5 py-3"><button onClick={() => open(c.id)} className="block w-full truncate text-left text-[13px] font-semibold text-ink hover:text-accent-ink">{truncate(c.message, 110)}</button></td>
                      <td className="max-w-[14rem] px-3 py-3 text-ink-2"><p className="truncate">{listLabels(c).join(", ") || "Typed or uploaded numbers"}</p></td>
                      <td className="px-3 py-3 text-ink-2"><span className="font-semibold text-ink">{formatNumber(c.sent)}</span> of {formatNumber(c.recipients)}{c.failed ? <span className="text-critical-ink"> · {c.failed} failed</span> : null}</td>
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
                    <span className="mt-1 block text-xs text-ink-3">{listLabels(c).join(", ") || "Typed or uploaded numbers"} · {timeAgo(c.created_at)}</span>
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-2"><Badge tone={meta.tone} icon={meta.icon} size="sm">{meta.label}</Badge><span>{formatNumber(c.sent)} of {formatNumber(c.recipients)} reached</span></div>
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
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) open(null); }}>
        {selected && (() => { const meta = smsStatus(effectiveStatus(selected)); return (
          <SheetContent title="Sent message" description={`${formatDateTime(selected.created_at)}${selected.sender?.full_name ? ` · by ${selected.sender.full_name}` : ""} · from ${selected.sender_id}`}
            footer={<>
              <Button variant="outline" onClick={() => open(null)}>Close</Button>
              <Button variant="outline" onClick={exportCsv} disabled={!messages.length}><FileSpreadsheet /> CSV</Button>
              {canSend && <Button asChild variant="outline"><Link href={`/sms?message=${encodeURIComponent(selected.message)}`}><Copy /> Use again</Link></Button>}
              {canSend && selected.failed > 0 && effectiveStatus(selected) !== "sending" && <Button loading={resending} onClick={() => resend(selected.id)}><RotateCcw /> Resend to {pluralize(selected.failed, "failed number")}</Button>}
            </>}>
            <div className="rounded-xl border border-line bg-surface-2 p-3"><p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{selected.message}</p></div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
              <span className="text-xs text-ink-2"><strong className="font-semibold text-ink">{formatNumber(selected.sent)}</strong> of {formatNumber(selected.recipients)} reached · {selected.segments} {selected.segments === 1 ? "part" : "parts"} each</span>
            </div>
            <p className="mt-1.5 text-xs text-ink-3">Lists: {listLabels(selected).join(", ") || "typed or uploaded numbers only"}.</p>
            {selected.status === "sending" && effectiveStatus(selected) === "partial" && <p className="mt-1.5 text-xs text-warning-ink">This blast was cut off before it finished. Numbers still marked “queued” were not sent; resend to them from a new message.</p>}
            {selected.error && <p className="mt-1.5 text-xs text-critical-ink">{selected.error}</p>}
            {canSend && selected.failed > 0 && <button className="mt-1.5 text-xs font-semibold text-accent-ink hover:underline" onClick={() => { navigator.clipboard.writeText(openMessages.filter((m) => m.status === "failed").map((m) => m.to_phone).join("\n")).then(() => toast.success("Failed numbers copied"), () => toast.error("Copying is blocked in this browser.")); }}>Copy the failed numbers</button>}

            <div className="mt-5 border-t border-line pt-4">
              <div className="scroll-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <FilterChip active={messageFilter === "all"} count={counts.all} onClick={() => setMessageFilter("all")}>Everyone</FilterChip>
                <FilterChip active={messageFilter === "sent"} count={counts.sent} onClick={() => setMessageFilter("sent")}>{SMS_STATUS.sent.label}</FilterChip>
                <FilterChip active={messageFilter === "failed"} count={counts.failed} onClick={() => setMessageFilter("failed")}>{SMS_STATUS.failed.label}</FilterChip>
                {counts.skipped > 0 && <FilterChip active={messageFilter === "skipped"} count={counts.skipped} onClick={() => setMessageFilter("skipped")}>{SMS_STATUS.skipped.label}</FilterChip>}
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input aria-label="Search recipients" placeholder="Name or number…" className="pl-9" value={messageQuery} onChange={(e) => setMessageQuery(e.target.value)} />
              </div>
              {messages.length === 0 ? <p className="mt-4 text-xs text-ink-3">{openMessages.length ? "Nobody matches." : "Recipient details are loading…"}</p> : (
                <ul className="mt-2 divide-y divide-line">
                  {messages.slice(0, messageShown).map((m) => { const s = smsStatus(m.status); return (
                    <li key={m.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13px] ${m.name ? "font-semibold text-ink" : "text-ink-3"}`}>{m.name ?? "No name"}</p>
                        <p className="truncate text-xs text-ink-3"><span className="font-mono">{displayPhone(m.to_phone)}</span> · {SOURCE_LABEL[m.source as Source] ?? m.source}{m.error ? <span className="text-critical-ink"> · {m.error}</span> : null}</p>
                      </div>
                      <Badge tone={s.tone} icon={s.icon} size="sm">{s.label}</Badge>
                    </li>
                  ); })}
                </ul>
              )}
              {messages.length > messageShown && <Button className="mt-2" variant="outline" size="sm" onClick={() => setMessageShown((n) => n + PAGE * 2)}>Show more ({formatNumber(messages.length - messageShown)} left)</Button>}
            </div>
          </SheetContent>
        ); })()}
      </Dialog>
    </>
  );
}
