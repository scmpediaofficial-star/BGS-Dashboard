"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Banknote, CircleCheck, Copy, ExternalLink, Landmark, RefreshCw, Scale, Settings, TicketX, Undo2, Wallet } from "lucide-react";
import { syncPayments } from "@/app/(app)/payments/actions";
import { StatTile } from "@/components/charts/stat-tile";
import { CustomersTab } from "@/components/payments/customers-tab";
import { copyText, StateBadge } from "@/components/payments/shared";
import { TransactionsTab } from "@/components/payments/transactions-tab";
import { useAutoImport } from "@/components/payments/use-auto-import";
import { PAYMENT_TABS, TAB_LABEL, type PaymentTab, type PaymentsData } from "@/components/payments/types";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { cn, formatDate, formatDateTime, formatMoney, formatNumber, pluralize, timeAgo } from "@/lib/utils";

export function PaymentsView({ tab, data, webhookUrl }: { tab: PaymentTab; data: PaymentsData; webhookUrl: string }) {
  const { can } = useViewer();
  // The ledger half of this page changes when a sale is recorded or a webhook lands.
  useRealtimeRefresh(["ticket_sales", "tickets"]);
  useAutoImport(data.autoImport ? 60_000 : 0);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [switching, startSwitch] = useTransition();
  const [refreshing, startRefresh] = useTransition();

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

  const [sync, syncing] = useAction(syncPayments, {
    success: (r) => (!r.imported && !r.linked && !r.refunded && !r.customers
      ? `Up to date — all ${pluralize(r.payments, "successful payment")} are in the ticket ledger`
      : [r.imported && `${pluralize(r.imported, "payment")} imported, tickets issued`, r.linked && `${r.linked} matched to existing sales`, r.refunded && `${pluralize(r.refunded, "refund")} applied`, r.customers && `${pluralize(r.customers, "buyer")} added to Paystack customers`].filter(Boolean).join(" · ")),
  });

  const successful = data.payments.filter((p) => p.status === "success");
  const currency = successful[0]?.currency ?? data.ticket.currency;
  const collected = successful.filter((p) => p.currency === currency).reduce((sum, p) => sum + p.amount, 0);
  const fees = successful.filter((p) => p.currency === currency).reduce((sum, p) => sum + (p.fees ?? 0), 0);
  const missing = successful.filter((p) => !data.ledgerByPayment[String(p.id)]);
  const balance = data.balance.find((b) => b.currency === currency) ?? data.balance[0];

  return (
    <>
      <PageHeader
        eyebrow="Commercial"
        title="Payments"
        description={<>Everything on Paystack, without leaving the dashboard. Each successful payment becomes a sale and a ticket automatically. {data.mode === "test" && <Badge tone="warning" size="sm" className="ml-1 align-middle">Test mode</Badge>}</>}
        actions={
          <>
            {can("settings.manage") && <Button asChild variant="outline"><Link href="/settings?tab=tickets"><Settings /> Settings</Link></Button>}
            <Button variant="outline" loading={refreshing} onClick={() => startRefresh(() => router.refresh())}>{!refreshing && <RefreshCw />} Refresh</Button>
            {can("payments.manage") && <Button loading={syncing} onClick={() => sync()}>{!syncing && <CircleCheck />} Sync tickets</Button>}
          </>
        }
      />

      <section aria-label="Paystack at a glance" className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Collected" value={formatMoney(collected, currency, true)} icon={Banknote} tone="good" caption={`${pluralize(successful.length, "successful payment")} · ${formatMoney(fees, currency)} in fees`} />
        <StatTile label="Paystack balance" value={balance ? formatMoney(balance.balance, balance.currency, true) : "—"} icon={Wallet} caption="Not yet paid out to the bank" />
        <StatTile label="Payments in the ticket ledger" value={formatNumber(successful.length - missing.length)} unit={`of ${formatNumber(successful.length)}`} icon={CircleCheck}
          tone={missing.length ? "critical" : "good"} meter={{ value: successful.length - missing.length, max: successful.length, tone: missing.length ? "warning" : "good" }}
          caption={missing.length ? `${pluralize(missing.length, "payment")} still to import — press Sync tickets` : `Every payment has its sale and ticket${data.lastChecked ? ` · checked ${timeAgo(data.lastChecked)}` : ""}`} />
        <StatTile label="Not completed" value={formatNumber(data.payments.filter((p) => p.status === "failed" || p.status === "abandoned").length)} icon={TicketX} caption="Failed or abandoned at checkout — worth a follow-up" />
      </section>

      {data.truncated && <p className="mb-4 rounded-xl border border-line bg-warning-soft px-4 py-2.5 text-xs font-medium text-warning-ink">Paystack holds more records than are listed here; the most recent 1,000 are shown.</p>}

      <Tabs value={tab} onValueChange={(next) => startSwitch(() => router.push(next === "transactions" ? pathname : `${pathname}?tab=${next}`, { scroll: false }))}>
        <TabsList>{PAYMENT_TABS.map((t) => <TabsTrigger key={t} value={t}>{TAB_LABEL[t]}</TabsTrigger>)}</TabsList>
      </Tabs>

      <div className={cn("pt-5 transition-opacity", switching && "pointer-events-none opacity-50")} aria-busy={switching}>
        {tab === "transactions" && <TransactionsTab data={data} setParams={setParams} onSync={() => sync()} syncing={syncing} />}
        {tab === "customers" && <CustomersTab data={data} setParams={setParams} />}
        {tab === "refunds" && (
          <SimpleList
            rows={data.refunds ?? []} rowKey={(r) => r.id} empty={{ icon: Undo2, title: "No refunds", description: "Refunds you issue from a payment appear here." }}
            columns={[
              { header: "Amount", cell: (r) => <span className="font-semibold text-ink">{formatMoney(r.amount, r.currency)}</span> },
              { header: "Status", cell: (r) => <StateBadge status={r.status} /> },
              { header: "Customer", cell: (r) => r.customerEmail ?? "—" },
              { header: "Payment", cell: (r) => (r.paymentId ? <button className="font-mono font-semibold text-accent-ink hover:underline" onClick={() => router.push(`${pathname}?payment=${r.paymentId}`)}>{r.reference ?? r.paymentId}</button> : "—") },
              { header: "Reason", cell: (r) => r.merchantNote ?? r.customerNote ?? "—" },
              { header: "Requested", cell: (r) => formatDate(r.createdAt) },
            ]}
            card={(r) => ({ title: formatMoney(r.amount, r.currency), badge: <StateBadge status={r.status} size="sm" />, lines: [r.customerEmail, r.merchantNote ?? r.customerNote, formatDate(r.createdAt)] })}
          />
        )}
        {tab === "payouts" && (
          <SimpleList
            rows={data.payouts ?? []} rowKey={(r) => r.id} empty={{ icon: Landmark, title: "No payouts yet", description: "When Paystack settles money to the bank account, each payout is listed here." }}
            columns={[
              { header: "Paid out", cell: (r) => <span className="font-semibold text-ink">{formatMoney(r.amount, r.currency)}</span> },
              { header: "Status", cell: (r) => <StateBadge status={r.status} /> },
              { header: "Payments processed", cell: (r) => (r.processed === null ? "—" : formatMoney(r.processed, r.currency)) },
              { header: "Fees", cell: (r) => (r.fees === null ? "—" : formatMoney(r.fees, r.currency)) },
              { header: "Date", cell: (r) => formatDate(r.settledAt) },
            ]}
            card={(r) => ({ title: formatMoney(r.amount, r.currency), badge: <StateBadge status={r.status} size="sm" />, lines: [r.fees === null ? null : `${formatMoney(r.fees, r.currency)} in fees`, formatDate(r.settledAt)] })}
          />
        )}
        {tab === "disputes" && (
          <SimpleList
            rows={data.disputes ?? []} rowKey={(r) => r.id} empty={{ icon: Scale, title: "No disputes", description: "If a customer questions a charge with their bank, it shows here with its deadline." }}
            columns={[
              { header: "Amount", cell: (r) => <span className="font-semibold text-ink">{formatMoney(r.amount, r.currency)}</span> },
              { header: "Status", cell: (r) => <StateBadge status={r.status} /> },
              { header: "Customer", cell: (r) => r.customerEmail ?? "—" },
              { header: "Reference", cell: (r) => <span className="font-mono">{r.reference ?? "—"}</span> },
              { header: "Category", cell: (r) => r.category ?? "—" },
              { header: "Respond by", cell: (r) => (r.resolvedAt ? `Resolved ${formatDate(r.resolvedAt)}` : formatDateTime(r.dueAt)) },
            ]}
            card={(r) => ({ title: formatMoney(r.amount, r.currency), badge: <StateBadge status={r.status} size="sm" />, lines: [r.customerEmail, r.category, r.resolvedAt ? `Resolved ${formatDate(r.resolvedAt)}` : r.dueAt ? `Respond by ${formatDateTime(r.dueAt)}` : null] })}
          />
        )}
        {tab === "pages" && (
          <SimpleList
            rows={data.pages ?? []} rowKey={(r) => r.id} empty={{ icon: ExternalLink, title: "No payment pages", description: "Payment pages created in Paystack are listed here with their links." }}
            columns={[
              { header: "Page", cell: (r) => <><span className="font-semibold text-ink">{r.name}</span>{r.description && <p className="max-w-md truncate text-ink-3">{r.description}</p>}</> },
              { header: "Amount", cell: (r) => (r.amount === null ? "Customer decides" : formatMoney(r.amount, r.currency)) },
              { header: "Status", cell: (r) => <Badge tone={r.active ? "good" : "neutral"} icon={r.active ? CircleCheck : TicketX}>{r.active ? "Active" : "Inactive"}</Badge> },
              { header: "Created", cell: (r) => formatDate(r.createdAt) },
              { header: "Link", className: "text-right", cell: (r) => <span className="inline-flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Copy the link to ${r.name}`} onClick={() => copyText(r.url, "Link")}><Copy /></Button><Button asChild variant="ghost" size="icon-sm"><a href={r.url} target="_blank" rel="noreferrer" aria-label={`Open ${r.name}`}><ExternalLink /></a></Button></span> },
            ]}
            card={(r) => ({ title: r.name, badge: <Badge tone={r.active ? "good" : "neutral"} icon={r.active ? CircleCheck : TicketX} size="sm">{r.active ? "Active" : "Inactive"}</Badge>, lines: [r.amount === null ? "Customer decides the amount" : formatMoney(r.amount, r.currency)], action: <Button variant="outline" size="sm" onClick={() => copyText(r.url, "Link")}><Copy /> Copy link</Button> })}
          />
        )}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-ink-3">
        {data.autoImport
          ? "Payments are imported and ticketed automatically: within a minute while the dashboard is open, and around the clock while the scheduler is on (Settings → Scheduler)."
          : "Automatic import is switched off (Settings → Tickets & payments). Press Sync tickets to bring payments in."}
        {can("settings.manage") && data.autoImport && <>{" "}For an instant import, set the webhook URL in Paystack → Settings → API Keys &amp; Webhooks to{" "}
          <button type="button" className="break-all font-mono font-semibold text-ink-2 hover:text-accent-ink" onClick={() => copyText(webhookUrl, "Webhook URL")}>{webhookUrl}</button>.</>}
      </p>
    </>
  );
}

type Column<T> = { header: string; cell: (row: T) => React.ReactNode; className?: string };
type CardView = { title: string; badge?: React.ReactNode; lines: (string | null | undefined)[]; action?: React.ReactNode };

/** Read-only Paystack list: a real table from `md` up, stacked cards on phones. */
function SimpleList<T>({ rows, rowKey, columns, card, empty }: {
  rows: T[]; rowKey: (row: T) => string | number; columns: Column<T>[]; card: (row: T) => CardView;
  empty: { icon: React.ComponentProps<typeof EmptyState>["icon"]; title: string; description: string };
}) {
  if (!rows.length) return <Card><EmptyState {...empty} /></Card>;
  return (
    <Card className="overflow-hidden">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3">
            <tr>{columns.map((c, i) => <th key={c.header} className={cn("py-3", i === 0 ? "pl-5 pr-3" : i === columns.length - 1 ? "pl-3 pr-5" : "px-3", c.className)}>{c.header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-surface-2">
                {columns.map((c, i) => <td key={c.header} className={cn("py-3 text-ink-2", i === 0 ? "pl-5 pr-3" : i === columns.length - 1 ? "pl-3 pr-5" : "px-3", c.className)}>{c.cell(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => {
          const view = card(row);
          return (
            <li key={rowKey(row)} className="p-4">
              <div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-[13px] font-bold text-ink">{view.title}</p>{view.badge}</div>
              {view.lines.filter(Boolean).map((line) => <p key={line} className="mt-0.5 truncate text-xs text-ink-3">{line}</p>)}
              {view.action && <div className="mt-2.5">{view.action}</div>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
