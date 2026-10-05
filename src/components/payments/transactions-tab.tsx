"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, CreditCard, Download, Search, Ticket, Undo2, UserRound } from "lucide-react";
import { refundPayment } from "@/app/(app)/payments/actions";
import { copyText, StateBadge } from "@/components/payments/shared";
import type { LedgerSale, PaymentsData, PaystackPayment } from "@/components/payments/types";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { TicketDownload } from "@/components/tickets/ticket-download";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { EmptyState, FilterChip } from "@/components/ui/misc";
import { PAYMENT_STATUS, paystackState } from "@/lib/domain";
import { formatDate, formatDateTime, formatMoney, isoDay, pluralize, toCsv } from "@/lib/utils";

const CHANNEL: Record<string, string> = { card: "Card", mobile_money: "Mobile money", bank_transfer: "Bank transfer", bank: "Bank", ussd: "USSD", qr: "QR", apple_pay: "Apple Pay" };
const channelLabel = (channel: string | null) => (channel ? CHANNEL[channel] ?? channel.replace(/_/g, " ") : "—");
const STATUS_ORDER = ["success", "failed", "abandoned", "reversed"];

type Props = { data: PaymentsData; setParams: (patch: Record<string, string | null>) => void; onSync: () => void; syncing: boolean };

export function TransactionsTab({ data, setParams, onSync, syncing }: Props) {
  const { can } = useViewer();
  const params = useSearchParams();
  const status = params.get("status") ?? "all";
  const openId = params.get("payment");
  const selected = data.payments.find((p) => String(p.id) === openId);
  const [query, setQuery] = useState("");
  const [refunding, setRefunding] = useState<{ amount: string; reason: string; note: string } | null>(null);
  const [refund, sendingRefund] = useAction(refundPayment, { onSuccess: () => setRefunding(null) });

  const statuses = useMemo(() => [...new Set([...STATUS_ORDER.filter((s) => data.payments.some((p) => p.status === s)), ...data.payments.map((p) => p.status)])], [data.payments]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.payments.filter((p) => (status === "all" || p.status === status) &&
      (!needle || `${p.customer.name} ${p.customer.email ?? ""} ${p.reference} ${p.id} ${p.receipt ?? ""} ${p.customer.code ?? ""}`.toLowerCase().includes(needle)));
  }, [data.payments, status, query]);

  function exportCsv() {
    const csv = toCsv([["Paid on", "Customer", "Email", "Amount", "Currency", "Status", "Channel", "Reference", "Receipt no.", "Paystack ID", "Customer code", "Fees", "Ticket numbers"],
      ...visible.map((p) => [p.paidAt ?? p.createdAt, p.customer.name, p.customer.email, p.amount, p.currency, paystackState(p.status).label, channelLabel(p.channel), p.reference, p.receipt, p.id, p.customer.code, p.fees, data.ledgerByPayment[String(p.id)]?.codes.join(" ")])]);
    const href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href, download: `bgs-paystack-payments-${isoDay()}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  }

  const ledgerOf = (p: PaystackPayment): LedgerSale | undefined => data.ledgerByPayment[String(p.id)];
  const ledgerCell = (p: PaystackPayment) => {
    const sale = ledgerOf(p);
    if (sale) return sale.status === "paid" && sale.tickets.length ? <span className="inline-flex flex-wrap items-center gap-2"><Badge tone="good" icon={Ticket} size="sm">{sale.codes.length === 1 ? sale.codes[0] : pluralize(sale.codes.length, "ticket")}</Badge><TicketDownload tickets={sale.tickets} event={data.event} /></span> : <Badge tone={PAYMENT_STATUS[sale.status].tone} icon={PAYMENT_STATUS[sale.status].icon} size="sm">{PAYMENT_STATUS[sale.status].label}</Badge>;
    return p.status === "success" ? <Badge tone="warning" icon={Ticket} size="sm">Not imported</Badge> : <span className="text-ink-3">—</span>;
  };
  const sale = selected ? ledgerOf(selected) : undefined;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search payments" placeholder="Search by name, email, reference or receipt no.…" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!visible.length}><Download /> Export</Button>
      </div>
      <div className="scroll-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <FilterChip active={status === "all"} count={data.payments.length} onClick={() => setParams({ status: null })}>All</FilterChip>
        {statuses.map((s) => <FilterChip key={s} active={status === s} count={data.payments.filter((p) => p.status === s).length} onClick={() => setParams({ status: s })}>{paystackState(s).label}</FilterChip>)}
      </div>

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <EmptyState icon={CreditCard} title={data.payments.length ? "No payments match" : "No payments yet"} description={data.payments.length ? "Try another search or status." : "Payments made on Paystack will appear here."} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3">
                  <tr><th className="px-5 py-3">Customer</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Ticket</th><th className="px-5 py-3">Date</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-2">
                      <td className="max-w-[16rem] px-5 py-3"><button onClick={() => setParams({ payment: String(p.id) })} className="block max-w-full truncate text-left font-bold text-ink hover:text-accent-ink">{p.customer.name}</button><p className="truncate text-ink-3">{p.customer.email}</p></td>
                      <td className="px-3 py-3 font-semibold text-ink">{formatMoney(p.amount, p.currency)}</td>
                      <td className="px-3 py-3"><StateBadge status={p.status} /></td>
                      <td className="px-3 py-3 text-ink-2">{channelLabel(p.channel)}</td>
                      <td className="px-3 py-3 font-mono text-ink-2">{p.reference}</td>
                      <td className="px-3 py-3">{ledgerCell(p)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-ink-3">{formatDate(p.paidAt ?? p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {visible.map((p) => (
                <li key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => setParams({ payment: String(p.id) })}><span className="block truncate text-[13px] font-bold text-ink">{p.customer.name}</span><span className="block truncate text-xs text-ink-3">{channelLabel(p.channel)} · {formatDate(p.paidAt ?? p.createdAt)}</span></button>
                    <span className="shrink-0 text-[13px] font-bold text-ink">{formatMoney(p.amount, p.currency)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><StateBadge status={p.status} size="sm" />{ledgerCell(p)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setParams({ payment: null }); setRefunding(null); } }}>
        {selected && (
          <SheetContent title={formatMoney(selected.amount, selected.currency)} description={`${selected.customer.name} · ${formatDateTime(selected.paidAt ?? selected.createdAt)}`}
            footer={<><Button variant="outline" onClick={() => setParams({ payment: null })}>Close</Button>{can("payments.refund") && selected.status === "success" && <Button variant="danger-ghost" onClick={() => setRefunding({ amount: String(selected.amount), reason: "", note: "" })}><Undo2 /> Refund</Button>}</>}>
            <div className="flex flex-wrap items-center gap-2"><StateBadge status={selected.status} />{selected.message && <span className="text-xs text-ink-3">{selected.message}</span>}</div>

            <dl className="mt-4 grid grid-cols-[minmax(0,8.5rem)_1fr] gap-x-4 gap-y-2.5 text-[13px]">
              <Row label="Reference"><Copyable value={selected.reference} label="Reference" /></Row>
              {selected.receipt && <Row label="Receipt number"><Copyable value={selected.receipt} label="Receipt number" /></Row>}
              <Row label="Paystack ID"><Copyable value={String(selected.id)} label="Paystack ID" /></Row>
              <Row label="Paid with">{selected.method ?? channelLabel(selected.channel)}</Row>
              {selected.fees !== null && <Row label="Paystack fees">{formatMoney(selected.fees, selected.currency)}</Row>}
              {selected.fees !== null && selected.status === "success" && <Row label="You receive">{formatMoney(selected.amount - selected.fees, selected.currency)}</Row>}
            </dl>

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-bold text-ink">Customer</p>
              <p className="mt-1.5 text-[13px] font-semibold text-ink">{selected.customer.name}</p>
              <p className="text-xs text-ink-3">{[selected.customer.email, selected.customer.phone].filter(Boolean).join(" · ")}</p>
              {selected.customer.code && <Button asChild variant="outline" size="sm" className="mt-2.5"><Link href={`/payments?tab=customers&customer=${selected.customer.code}`}><UserRound /> Open customer</Link></Button>}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-bold text-ink">Ticket</p>
              {sale ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={PAYMENT_STATUS[sale.status].tone} icon={PAYMENT_STATUS[sale.status].icon}>{PAYMENT_STATUS[sale.status].label}</Badge>
                    {sale.codes.map((code) => <span key={code} className="rounded-lg bg-surface-3 px-2 py-1 font-mono text-xs font-bold text-ink">{code}</span>)}
                  </div>
                  {!sale.codes.length && <p className="mt-2 text-xs text-ink-3">This sale has no valid tickets.</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <TicketDownload variant="button" tickets={sale.tickets} event={data.event} />
                    <Button asChild variant="outline"><Link href={`/tickets?tab=sales&item=${sale.id}`}><Ticket /> Open sale</Link></Button>
                  </div>
                </>
              ) : selected.status === "success" ? (
                <>
                  <p className="mt-1.5 text-xs text-ink-3">This payment is not in the ticket ledger yet, so no ticket has been issued.</p>
                  {can("payments.manage") && <Button size="sm" className="mt-2.5" loading={syncing} onClick={onSync}>Import and issue ticket</Button>}
                </>
              ) : (
                <p className="mt-1.5 text-xs text-ink-3">No ticket: the payment did not go through.</p>
              )}
            </div>
          </SheetContent>
        )}
      </Dialog>

      <Dialog open={!!refunding && !!selected} onOpenChange={(open) => { if (!open) setRefunding(null); }}>
        {refunding && selected && (
          <DialogContent size="sm" title="Refund this payment?" description={`${selected.customer.name} paid ${formatMoney(selected.amount, selected.currency)}. The money goes back to how they paid; Paystack usually takes a few working days.`}
            footer={<><Button variant="outline" onClick={() => setRefunding(null)} disabled={sendingRefund}>Cancel</Button><Button variant="danger" form="refund-form" type="submit" loading={sendingRefund}>Refund {Number(refunding.amount) > 0 ? formatMoney(Number(refunding.amount), selected.currency) : ""}</Button></>}>
            <form id="refund-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault(); refund({ paymentId: selected.id, amount: refunding.amount, merchantNote: refunding.reason, customerNote: refunding.note }); }}>
              <Field label={`Amount (${selected.currency})`} htmlFor="refund-amount" hint="A full refund also marks the sale refunded and voids its tickets. A part refund leaves them as they are.">
                <Input id="refund-amount" type="number" inputMode="decimal" min="0.01" step="0.01" max={selected.amount} required value={refunding.amount} onChange={(e) => setRefunding({ ...refunding, amount: e.target.value })} />
              </Field>
              <Field label="Reason" htmlFor="refund-reason" hint="For the team and the audit trail."><Input id="refund-reason" required value={refunding.reason} onChange={(e) => setRefunding({ ...refunding, reason: e.target.value })} placeholder="e.g. Paid twice" /></Field>
              <Field label="Note to the customer" htmlFor="refund-note" optional><Textarea id="refund-note" className="min-h-16" value={refunding.note} onChange={(e) => setRefunding({ ...refunding, note: e.target.value })} /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <><dt className="text-ink-3">{label}</dt><dd className="min-w-0 break-words font-medium text-ink">{children}</dd></>;
}

function Copyable({ value, label }: { value: string; label: string }) {
  return (
    <button type="button" onClick={() => copyText(value, label)} className="group inline-flex max-w-full items-center gap-1.5 text-left font-mono text-[12.5px] font-semibold text-ink hover:text-accent-ink" aria-label={`Copy ${label.toLowerCase()} ${value}`}>
      <span className="break-all">{value}</span><Copy aria-hidden className="size-3.5 shrink-0 text-ink-3 group-hover:text-accent-ink" />
    </button>
  );
}
