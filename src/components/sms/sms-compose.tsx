"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { sendCampaign } from "@/app/(app)/sms/actions";
import { useAction } from "@/components/shared/use-action";
import { GROUP_KEYS, GROUPS, SOURCE_LABEL, type Audience, type GroupKey, type Recipient, type Source } from "@/components/sms/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { EmptyState, FilterChip } from "@/components/ui/misc";
import type { SmsSettings } from "@/lib/settings";
import type { SmsBalance } from "@/lib/sms/gateway";
import { displayPhone, hasNameToken, parseNumberList, plainText, renderSms, smsLength } from "@/lib/sms/text";
import { formatNumber, pluralize } from "@/lib/utils";

const PAGE = 100;
const MAX_MESSAGE = 1000;
type SourceFilter = "all" | Source;

type Props = { audience: Audience; sms: SmsSettings; balance: SmsBalance | null; ready: boolean; canSend: boolean; initialMessage?: string };

export function SmsCompose({ audience, sms, balance, ready, canSend, initialMessage = "" }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState(initialMessage);
  const [groups, setGroups] = useState<Set<GroupKey>>(new Set());
  const [manual, setManual] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const [confirming, setConfirming] = useState(false);

  const [send, sending] = useAction(sendCampaign, {
    success: ({ sent, failed }) => (failed ? `Sent to ${formatNumber(sent)}; ${pluralize(failed, "number")} failed` : `Sent to ${pluralize(sent, "person", "people")}`),
    onSuccess: ({ id }) => router.push(`/sms?campaign=${id}`),
  });

  // The list exactly as the server will build it: chosen lists first, then typed or uploaded numbers, one row per number.
  const typed = useMemo(() => parseNumberList(manual, sms.country_code), [manual, sms.country_code]);
  const { recipients, duplicates, invalid } = useMemo(() => {
    const seen = new Set<string>();
    const list: Recipient[] = [];
    let duplicates = 0;
    for (const g of GROUP_KEYS) {
      if (!groups.has(g)) continue;
      for (const r of audience.recipients[g]) { if (seen.has(r.phone)) { duplicates++; continue; } seen.add(r.phone); list.push(r); }
    }
    let invalid = 0;
    for (const row of typed) {
      if (!row.phone) { invalid++; continue; }
      if (seen.has(row.phone)) { duplicates++; continue; }
      seen.add(row.phone); list.push({ key: row.phone, name: row.name, phone: row.phone, source: fileName ? "csv" : "manual", detail: null });
    }
    return { recipients: list, duplicates, invalid };
  }, [audience, groups, typed, fileName]);

  const included = useMemo(() => recipients.filter((r) => !excluded.has(r.phone)), [recipients, excluded]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipients.filter((r) => (sourceFilter === "all" || r.source === sourceFilter) && (!needle || `${r.name ?? ""} ${r.phone} ${r.detail ?? ""}`.toLowerCase().includes(needle)));
  }, [recipients, query, sourceFilter]);
  const visible = filtered.slice(0, shown);
  const sources = useMemo(() => [...new Set(recipients.map((r) => r.source))], [recipients]);

  const personalised = hasNameToken(message);
  const sample = included.find((r) => r.name) ?? included[0];
  const preview = renderSms(plainText(message), personalised ? sample?.name : null, sms.signature);
  const length = smsLength(preview);
  const credits = included.length * length.segments;
  const short = balance?.units !== null && balance?.units !== undefined && credits > balance.units;
  const canGo = ready && canSend && included.length > 0 && length.chars > 0 && message.length <= MAX_MESSAGE && !sending;

  function toggleGroup(g: GroupKey, on: boolean) { setGroups((prev) => { const next = new Set(prev); if (on) next.add(g); else next.delete(g); return next; }); setShown(PAGE); }
  function toggleIncluded(phone: string, on: boolean) { setExcluded((prev) => { const next = new Set(prev); if (on) next.delete(phone); else next.add(phone); return next; }); }
  function excludeShown(on: boolean) { setExcluded((prev) => { const next = new Set(prev); for (const r of filtered) { if (on) next.delete(r.phone); else next.add(r.phone); } return next; }); }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) { toast.error("That file is over 2 MB. Split it or paste the numbers instead."); return; }
    const text = await file.text();
    const rows = parseNumberList(text, sms.country_code);
    if (!rows.length) { toast.error("No rows found in that file. Use the template: one person per line with a phone column."); return; }
    setManual((prev) => (prev.trim() ? `${prev.trim()}\n${text.trim()}` : text.trim()));
    setFileName(file.name);
    toast.success(`${pluralize(rows.filter((r) => r.phone).length, "number")} read from ${file.name}${rows.some((r) => !r.phone) ? `, ${rows.filter((r) => !r.phone).length} could not be read` : ""}`);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Card className="p-5">
            <h2 className="text-sm font-bold text-ink">Message</h2>
            <p className="mt-1 text-xs text-ink-3">Plain text. Write <code className="rounded bg-surface-3 px-1 font-mono text-[11px] text-ink">{"{name}"}</code> to greet each person by first name; a name the dashboard doesn’t have is simply left out.</p>
            <Field label="Text" htmlFor="sms-message" className="mt-4" error={message.length > MAX_MESSAGE ? `Keep it under ${MAX_MESSAGE} characters.` : undefined}>
              <Textarea id="sms-message" rows={6} maxLength={MAX_MESSAGE + 200} disabled={!canSend} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Dear {name}, the Boardroom Governance Summit now holds on Thursday 12 November 2026 at Labadi Beach Hotel. Your ticket remains valid." />
            </Field>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
              <span><strong className="font-semibold text-ink">{formatNumber(length.chars)}</strong> characters</span>
              <span><strong className="font-semibold text-ink">{length.segments}</strong> SMS {length.segments === 1 ? "part" : "parts"} per person ({length.perSegment} per part)</span>
              {length.unicode && <Badge tone="warning">Special characters: 70 per part</Badge>}
              {personalised && <Badge tone="accent">Personalised</Badge>}
            </div>
            {preview && (
              <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">How it reads{sample?.name && personalised ? ` for ${sample.name}` : ""}</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{preview}</p>
                <p className="mt-2 text-[11px] text-ink-3">From <strong className="font-semibold text-ink-2">{sms.sender_id.trim() || "(sender ID not set)"}</strong></p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-bold text-ink">Send to</h2>
            <p className="mt-1 text-xs text-ink-3">Tick the lists. People who appear in more than one list get the message once.</p>
            <div className="mt-3 divide-y divide-line">
              {GROUP_KEYS.map((g) => {
                const s = audience.summary[g];
                const id = `sms-group-${g}`;
                return (
                  <div key={g} className="flex items-start gap-3 py-2.5">
                    <Checkbox id={id} className="mt-0.5" checked={groups.has(g)} disabled={!canSend || s.withPhone === 0} onCheckedChange={(v) => toggleGroup(g, v === true)} />
                    <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                      <span className="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-ink">{GROUPS[g].label}<span className="text-xs font-normal text-ink-3">· {GROUPS[g].source}</span></span>
                      <span className="block text-xs text-ink-3">{GROUPS[g].description}. {s.withPhone === 0 ? (s.total ? `${formatNumber(s.total)} on the list, none with a phone number.` : "Nobody on this list yet.") : `${formatNumber(s.withPhone)} with a number${s.total > s.withPhone ? `, ${formatNumber(s.total - s.withPhone)} without` : ""}.`}</span>
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div><h3 className="text-[13px] font-bold text-ink">Other numbers</h3><p className="mt-0.5 text-xs text-ink-3">One per line: <span className="font-mono">0244123456</span> or <span className="font-mono">Ama Mensah, 0244123456</span>. Or upload a CSV.</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="ghost" size="sm"><a href="/sms-numbers-template.csv" download><Download /> CSV template</a></Button>
                  <Button variant="outline" size="sm" disabled={!canSend} onClick={() => fileInput.current?.click()}><FileUp /> Upload CSV</Button>
                  <input ref={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" aria-label="Upload a CSV of phone numbers" onChange={(e) => readFile(e.target.files?.[0])} />
                </div>
              </div>
              <Textarea aria-label="Other numbers" className="mt-3 font-mono text-xs" rows={5} disabled={!canSend} value={manual} onChange={(e) => { setManual(e.target.value); if (!e.target.value.trim()) setFileName(null); }} />
              {(typed.length > 0 || fileName) && (
                <p className="mt-1.5 text-xs text-ink-3">{fileName ? `${fileName}: ` : ""}{pluralize(typed.filter((r) => r.phone).length, "number")} read{invalid ? <span className="text-critical-ink">, {invalid} could not be read</span> : ""}{duplicates ? `, ${duplicates} already in another list` : ""}.</p>
              )}
            </div>
          </Card>
        </div>

        <Card className="flex flex-col overflow-hidden xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)]">
          <div className="border-b border-line px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">Who gets it</h2>
              <Button loading={sending} disabled={!canGo} onClick={() => setConfirming(true)}><Send /> Send to {formatNumber(included.length)}</Button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 px-2 py-2"><p className="text-lg font-extrabold leading-none text-ink">{formatNumber(included.length)}</p><p className="mt-1 text-[11px] text-ink-3">people</p></div>
              <div className="rounded-xl bg-surface-2 px-2 py-2"><p className="text-lg font-extrabold leading-none text-ink">{formatNumber(credits)}</p><p className="mt-1 text-[11px] text-ink-3">SMS credits</p></div>
              <div className={`rounded-xl px-2 py-2 ${short ? "bg-critical-soft" : "bg-surface-2"}`}><p className={`text-lg font-extrabold leading-none ${short ? "text-critical-ink" : "text-ink"}`}>{balance?.units !== null && balance?.units !== undefined ? formatNumber(balance.units) : "—"}</p><p className={`mt-1 text-[11px] ${short ? "text-critical-ink" : "text-ink-3"}`}>credits left</p></div>
            </div>
            {short && <p className="mt-2 text-xs font-medium text-critical-ink">Not enough credits for everyone. Top up at BulkSMSGH or send to fewer people.</p>}
            {excluded.size > 0 && <p className="mt-2 text-xs text-ink-3">{pluralize(excluded.size, "person", "people")} left out by hand. <button className="font-semibold text-accent-ink hover:underline" onClick={() => setExcluded(new Set())}>Put everyone back</button></p>}
          </div>

          {recipients.length > 0 && (
            <div className="grid gap-2 border-b border-line px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input aria-label="Search recipients" placeholder="Search by name or number…" className="pl-9" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
              </div>
              {sources.length > 1 && (
                <div className="scroll-none -mx-5 flex gap-2 overflow-x-auto px-5">
                  <FilterChip active={sourceFilter === "all"} count={recipients.length} onClick={() => { setSourceFilter("all"); setShown(PAGE); }}>All</FilterChip>
                  {sources.map((s) => <FilterChip key={s} active={sourceFilter === s} count={recipients.filter((r) => r.source === s).length} onClick={() => { setSourceFilter(s); setShown(PAGE); }}>{SOURCE_LABEL[s]}</FilterChip>)}
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>{formatNumber(filtered.length)} shown · {formatNumber(filtered.filter((r) => !excluded.has(r.phone)).length)} included</span>
                <span className="flex gap-3"><button className="font-semibold text-accent-ink hover:underline" onClick={() => excludeShown(true)}>Include shown</button><button className="font-semibold text-accent-ink hover:underline" onClick={() => excludeShown(false)}>Leave out shown</button></span>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {recipients.length === 0 ? (
              <EmptyState icon={Users} title="Nobody chosen yet" description="Tick a list on the left, paste numbers, or upload a CSV." />
            ) : filtered.length === 0 ? (
              <EmptyState icon={Search} title="No one matches" description="Try another name, number or list." />
            ) : (
              <ul className="divide-y divide-line">
                {visible.map((r) => {
                  const on = !excluded.has(r.phone);
                  const id = `sms-r-${r.key}`;
                  return (
                    <li key={r.key} className={`flex items-center gap-3 px-5 py-2 ${on ? "" : "opacity-60"}`}>
                      <Checkbox id={id} checked={on} disabled={!canSend} onCheckedChange={(v) => toggleIncluded(r.phone, v === true)} aria-label={`Include ${r.name ?? displayPhone(r.phone)}`} />
                      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                        <span className={`block truncate text-[13px] ${r.name ? "font-semibold text-ink" : "text-ink-3"}`}>{r.name ?? "No name"}</span>
                        <span className="block truncate text-xs text-ink-3"><span className="font-mono">{displayPhone(r.phone)}</span>{r.detail ? ` · ${r.detail}` : ""}</span>
                      </label>
                      <Badge size="sm">{SOURCE_LABEL[r.source]}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
            {filtered.length > visible.length && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-ink-3">
                <span>Showing {formatNumber(visible.length)} of {formatNumber(filtered.length)}.</span>
                <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show more</Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={`Send to ${pluralize(included.length, "person", "people")}?`} confirmLabel="Send now" loading={sending}
        description={`${formatNumber(credits)} SMS ${credits === 1 ? "credit" : "credits"} will be used (${length.segments} ${length.segments === 1 ? "part" : "parts"} each). Messages go out straight away and cannot be recalled.`}
        onConfirm={async () => {
          const result = await send({ message, groups: [...groups], manual, excluded: [...excluded] });
          if (result.ok) { setConfirming(false); setMessage(""); setGroups(new Set()); setManual(""); setFileName(null); setExcluded(new Set()); }
        }} />
    </>
  );
}
