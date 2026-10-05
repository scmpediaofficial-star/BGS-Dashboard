"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Ban, CircleDashed, Copy, Download, Link2, Plus, Search, ShieldCheck, Ticket, UsersRound } from "lucide-react";
import { requestPayment, saveCustomer, setRisk } from "@/app/(app)/payments/actions";
import { copyText, StateBadge } from "@/components/payments/shared";
import type { PaymentsData, PaystackCustomer } from "@/components/payments/types";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { TicketDownload } from "@/components/tickets/ticket-download";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, FilterChip } from "@/components/ui/misc";
import { formatDate, formatMoney, isoDay, pluralize, toCsv } from "@/lib/utils";

type Props = { data: PaymentsData; setParams: (patch: Record<string, string | null>) => void };
type Draft = { first_name: string; last_name: string; email: string; phone: string };
const blank: Draft = { first_name: "", last_name: "", email: "", phone: "" };
const draftOf = (c: PaystackCustomer): Draft => ({ first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone ?? "" });
const displayName = (c: PaystackCustomer) => c.name || c.email;

export function CustomersTab({ data, setParams }: Props) {
  const { can } = useViewer();
  const manage = can("payments.manage");
  const params = useSearchParams();
  const customers = useMemo(() => data.customers ?? [], [data.customers]);
  const openCode = params.get("customer");
  const creating = params.get("new") === "1";
  const filter = params.get("show") ?? "all";
  const selected = customers.find((c) => c.code === openCode);

  const [query, setQuery] = useState("");
  const draftKey = openCode ?? (creating ? "new" : "");
  const [draftState, setDraftState] = useState<{ key: string; values: Draft }>({ key: "", values: blank });
  const draft = draftState.key === draftKey ? draftState.values : selected ? draftOf(selected) : blank;
  const setDraft = (values: Draft) => setDraftState({ key: draftKey, values });
  const [link, setLink] = useState<{ amount: string; url: string | null } | null>(null);

  const [save, saving] = useAction(saveCustomer, { success: "Customer saved", onSuccess: ({ code }) => setParams({ new: null, customer: code }) });
  const [changeRisk, changingRisk] = useAction(setRisk, { success: "Customer updated" });
  const [request, requesting] = useAction(requestPayment, { success: "Payment link ready", onSuccess: ({ url }) => setLink((current) => (current ? { ...current, url } : current)) });

  // A customer "has paid" when Paystack shows a successful payment from them; "has a ticket" when the ledger holds a live one.
  const paidBy = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of data.payments) if (p.status === "success" && p.customer.code) map.set(p.customer.code, (map.get(p.customer.code) ?? 0) + 1);
    return map;
  }, [data.payments]);
  const ticketsOf = (c: PaystackCustomer) => {
    const sales = new Map([...(data.ledgerByCustomer[c.code] ?? []), ...(data.ledgerByCustomer[c.email.trim().toLowerCase()] ?? [])].map((s) => [s.id, s]));
    return [...sales.values()];
  };
  const codesOf = (c: PaystackCustomer) => ticketsOf(c).flatMap((s) => s.codes);
  const heldBy = (c: PaystackCustomer) => ticketsOf(c).flatMap((s) => s.tickets);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return customers.filter((c) =>
      (filter === "all" || (filter === "paid" ? paidBy.has(c.code) : !paidBy.has(c.code))) &&
      (!needle || `${c.name} ${c.email} ${c.phone ?? ""} ${c.code}`.toLowerCase().includes(needle)));
  }, [customers, filter, paidBy, query]);

  function exportCsv() {
    const csv = toCsv([["Name", "Customer code", "Email", "Phone", "Paid via Paystack", "Ticket numbers", "Added on"],
      ...visible.map((c) => [displayName(c), c.code, c.email, c.phone, paidBy.has(c.code) ? "Yes" : "No", codesOf(c).join(" "), c.createdAt ? isoDay(c.createdAt) : ""])]);
    const href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href, download: `bgs-paystack-customers-${isoDay()}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  }

  const statusCell = (c: PaystackCustomer) => {
    const codes = codesOf(c);
    if (codes.length) return <span className="inline-flex flex-wrap items-center gap-2"><Badge tone="good" icon={Ticket} size="sm">{codes.length === 1 ? codes[0] : pluralize(codes.length, "ticket")}</Badge><TicketDownload tickets={heldBy(c)} event={data.event} /></span>;
    if (paidBy.has(c.code)) return <Badge tone="warning" icon={Ticket} size="sm">Paid · no ticket yet</Badge>;
    return <Badge tone="neutral" icon={CircleDashed} size="sm">No payment</Badge>;
  };
  const riskBadge = (c: PaystackCustomer) => (c.risk === "deny" ? <Badge tone="critical" icon={Ban} size="sm">Blacklisted</Badge> : c.risk === "allow" ? <Badge tone="good" icon={ShieldCheck} size="sm">Whitelisted</Badge> : null);

  const payments = selected ? data.payments.filter((p) => p.customer.code === selected.code) : [];
  const saleLink = (c: PaystackCustomer) => `/tickets?${new URLSearchParams({ tab: "sales", new: "1", name: displayName(c), email: c.email, ...(c.phone ? { phone: c.phone } : {}) })}`;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search customers" placeholder="Search by name, email, phone or customer code…" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!visible.length}><Download /> Export</Button>
          {manage && <Button onClick={() => { setDraftState({ key: "new", values: blank }); setParams({ new: "1", customer: null }); }}><Plus /> New customer</Button>}
        </div>
      </div>
      <div className="scroll-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <FilterChip active={filter === "all"} count={customers.length} onClick={() => setParams({ show: null })}>All</FilterChip>
        <FilterChip active={filter === "paid"} count={customers.filter((c) => paidBy.has(c.code)).length} onClick={() => setParams({ show: "paid" })}>Paid via Paystack</FilterChip>
        <FilterChip active={filter === "unpaid"} count={customers.filter((c) => !paidBy.has(c.code)).length} onClick={() => setParams({ show: "unpaid" })}>No payment yet</FilterChip>
      </div>

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <EmptyState icon={UsersRound} title={customers.length ? "No customers match" : "No customers yet"} description={customers.length ? "Try another search or filter." : "People appear here when they pay, or when you add them."} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3">
                  <tr><th className="px-5 py-3">Customer</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Customer code</th><th className="px-3 py-3">Ticket</th><th className="px-5 py-3">Added</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((c) => (
                    <tr key={c.code} className="hover:bg-surface-2">
                      <td className="max-w-[18rem] px-5 py-3"><span className="flex items-center gap-2"><button onClick={() => setParams({ customer: c.code, new: null })} className="min-w-0 truncate text-left font-bold text-ink hover:text-accent-ink">{displayName(c)}</button>{riskBadge(c)}</span><p className="truncate text-ink-3">{c.email}</p></td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink-2">{c.phone ?? "—"}</td>
                      <td className="px-3 py-3 font-mono text-ink-2">{c.code}</td>
                      <td className="px-3 py-3">{statusCell(c)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-ink-3">{formatDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {visible.map((c) => (
                <li key={c.code} className="p-4">
                  <button className="block w-full min-w-0 text-left" onClick={() => setParams({ customer: c.code, new: null })}>
                    <span className="block truncate text-[13px] font-bold text-ink">{displayName(c)}</span>
                    <span className="block truncate text-xs text-ink-3">{c.email}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-ink-3">{c.code}</span>
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-2">{statusCell(c)}{riskBadge(c)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* ── One customer ─────────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setParams({ customer: null }); }}>
        {selected && (
          <SheetContent title={displayName(selected)} description={`Paystack customer since ${formatDate(selected.createdAt)}`}
            footer={manage ? <><Button variant="outline" onClick={() => setParams({ customer: null })}>Close</Button><Button form="customer-form" type="submit" loading={saving}>Save customer</Button></> : undefined}>
            <div className="flex flex-wrap items-center gap-2">
              {statusCell(selected)}{riskBadge(selected)}
              <button type="button" onClick={() => copyText(selected.code, "Customer code")} className="group inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-ink-2 hover:text-accent-ink" aria-label={`Copy customer code ${selected.code}`}>{selected.code}<Copy aria-hidden className="size-3.5 text-ink-3 group-hover:text-accent-ink" /></button>
            </div>

            {manage && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link href={saleLink(selected)}><Ticket /> Record a sale and issue ticket</Link></Button>
                <Button variant="outline" size="sm" onClick={() => setLink({ amount: data.ticket.price ? String(data.ticket.price) : "", url: null })}><Link2 /> Payment link</Button>
              </div>
            )}

            <form id="customer-form" className="mt-5 grid gap-4 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); save({ ...draft, code: selected.code }); }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" htmlFor="customer-first"><Input id="customer-first" required disabled={!manage} value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} /></Field>
                <Field label="Last name" htmlFor="customer-last"><Input id="customer-last" required disabled={!manage} value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} /></Field>
              </div>
              <Field label="Email" htmlFor="customer-email" hint="Paystack identifies a customer by email, so it can't be changed."><Input id="customer-email" type="email" disabled value={draft.email} readOnly /></Field>
              <Field label="Phone" htmlFor="customer-phone" optional><Input id="customer-phone" type="tel" disabled={!manage} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
            </form>

            {manage && (
              <div className="mt-5 border-t border-line pt-4">
                <Field label="Paystack list" htmlFor="customer-risk" hint="Blacklisted customers cannot pay you. Whitelisted customers are never blocked by Paystack's fraud checks.">
                  <Select id="customer-risk" disabled={changingRisk} value={selected.risk} onChange={(e) => changeRisk({ code: selected.code, risk: e.target.value, name: displayName(selected) })}>
                    <option value="default">Neither (default)</option>
                    <option value="allow">Whitelisted</option>
                    <option value="deny">Blacklisted</option>
                  </Select>
                </Field>
              </div>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-bold text-ink">Payments</p>
              {payments.length === 0 ? <p className="mt-1.5 text-xs text-ink-3">No payments from this customer on Paystack.</p> : (
                <ul className="mt-2 grid gap-2">
                  {payments.map((p) => (
                    <li key={p.id}>
                      <Link href={`/payments?payment=${p.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 transition-colors hover:bg-surface-2">
                        <span className="min-w-0"><span className="block text-[13px] font-bold text-ink">{formatMoney(p.amount, p.currency)}</span><span className="block truncate text-xs text-ink-3">{formatDate(p.paidAt ?? p.createdAt)} · {p.reference}</span></span>
                        <StateBadge status={p.status} size="sm" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {codesOf(selected).length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-xs font-bold text-ink">Tickets</p>
                <ul className="mt-2 grid gap-2">
                  {heldBy(selected).map((t) => (
                    <li key={t.code} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
                      <span className="min-w-0"><span className="block font-mono text-[13px] font-bold text-ink">{t.code}</span><span className="block truncate text-xs text-ink-3">{t.holder_name ?? "No name"}</span></span>
                      <TicketDownload ticket={t} event={data.event} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SheetContent>
        )}
      </Dialog>

      {/* ── New customer ─────────────────────────────────────────────────── */}
      <Dialog open={creating} onOpenChange={(open) => { if (!open) setParams({ new: null }); }}>
        <DialogContent title="New customer" description="Adds the person to Paystack. You can then record their sale, or send them a payment link."
          footer={<><Button variant="outline" onClick={() => setParams({ new: null })}>Cancel</Button><Button form="new-customer-form" type="submit" loading={saving}>Add customer</Button></>}>
          <form id="new-customer-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save(draft); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="new-first"><Input id="new-first" required autoComplete="off" value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} /></Field>
              <Field label="Last name" htmlFor="new-last"><Input id="new-last" required autoComplete="off" value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} /></Field>
            </div>
            <Field label="Email" htmlFor="new-email"><Input id="new-email" type="email" required autoComplete="off" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="new-phone" optional hint="With the country code, e.g. +233 24 123 4567."><Input id="new-phone" type="tel" autoComplete="off" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Payment link ─────────────────────────────────────────────────── */}
      <Dialog open={!!link && !!selected} onOpenChange={(open) => { if (!open) setLink(null); }}>
        {link && selected && (
          <DialogContent size="sm" title="Payment link" description={`A Paystack checkout for ${displayName(selected)}. Nothing is charged until they pay; their ticket is issued when they do.`}
            footer={link.url
              ? <><Button variant="outline" onClick={() => setLink(null)}>Done</Button><Button onClick={() => copyText(link.url!, "Payment link")}><Copy /> Copy link</Button></>
              : <><Button variant="outline" onClick={() => setLink(null)}>Cancel</Button><Button form="link-form" type="submit" loading={requesting}>Create link</Button></>}>
            {link.url ? (
              <div className="grid gap-2">
                <p className="text-[13px] text-ink-2">Send this link to {displayName(selected)}:</p>
                <p className="break-all rounded-xl border border-line bg-surface-2 px-3 py-2.5 font-mono text-xs text-ink">{link.url}</p>
              </div>
            ) : (
              <form id="link-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); request({ email: selected.email, name: displayName(selected), amount: Number(link.amount), currency: data.ticket.currency }); }}>
                <Field label={`Amount (${data.ticket.currency})`} htmlFor="link-amount" hint={data.ticket.price ? `One ticket is ${formatMoney(data.ticket.price, data.ticket.currency)}. A multiple of it issues that many tickets.` : undefined}>
                  <Input id="link-amount" type="number" inputMode="decimal" min="1" step="0.01" required value={link.amount} onChange={(e) => setLink({ ...link, amount: e.target.value })} />
                </Field>
              </form>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
