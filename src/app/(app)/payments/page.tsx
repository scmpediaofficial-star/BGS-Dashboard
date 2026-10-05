import type { Metadata } from "next";
import { PaymentsSetup, PaymentsUnavailable } from "@/components/payments/payments-setup";
import { PaymentsView } from "@/components/payments/payments-view";
import { PAYMENT_TABS, type LedgerSale, type PaymentTab, type PaymentsData } from "@/components/payments/types";
import { ActionError } from "@/lib/actions";
import { ticketEvent } from "@/lib/attendance";
import { requireRole, type Session } from "@/lib/auth/session";
import type { PaymentStatus, TicketKind } from "@/lib/domain";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/env";
import { getBalance, isPaystackConfigured, listCustomers, listDisputes, listPaymentPages, listPayments, listPayouts, listRefunds, paystackMode } from "@/lib/paystack";

export const metadata: Metadata = { title: "Payments" };

/** Sales that came from, or belong to, a Paystack payment or customer — with the ticket numbers issued for them. */
async function loadLedger(supabase: Session["supabase"]) {
  const [sales, tickets] = await Promise.all([
    supabase.from("ticket_sales").select("id, buyer_name, buyer_email, payment_status, paystack_id, paystack_customer_code").order("sold_at"),
    supabase.from("tickets").select("sale_id, code, kind, holder_name, organization, role_label").not("sale_id", "is", null).neq("status", "void").order("seq"),
  ]);
  const held = new Map<string, LedgerSale["tickets"]>();
  for (const t of tickets.data ?? []) {
    held.set(t.sale_id!, [...(held.get(t.sale_id!) ?? []), { code: t.code, kind: t.kind as TicketKind, holder_name: t.holder_name, organization: t.organization, role_label: t.role_label }]);
  }

  const byPayment: Record<string, LedgerSale> = {};
  const byCustomer: Record<string, LedgerSale[]> = {};
  for (const s of sales.data ?? []) {
    const sale: LedgerSale = { id: s.id, status: s.payment_status as PaymentStatus, buyer: s.buyer_name, codes: (held.get(s.id) ?? []).map((t) => t.code), tickets: held.get(s.id) ?? [] };
    if (s.paystack_id !== null) byPayment[String(s.paystack_id)] = sale;
    for (const key of new Set([s.paystack_customer_code, s.buyer_email?.trim().toLowerCase()])) {
      if (key) (byCustomer[key] ??= []).push(sale);
    }
  }
  return { byPayment, byCustomer };
}

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const { supabase } = await requireRole("manager");
  const params = await searchParams;
  const requested = typeof params.tab === "string" ? params.tab : "";
  // A link to one customer (`?customer=`) opens the customers tab even without `tab=`.
  const tab: PaymentTab = (PAYMENT_TABS as readonly string[]).includes(requested) ? (requested as PaymentTab) : typeof params.customer === "string" ? "customers" : "transactions";
  const webhookUrl = `${siteUrl()}/api/paystack/webhook`;

  if (!isPaystackConfigured()) return <PaymentsSetup webhookUrl={webhookUrl} />;

  let data: PaymentsData;
  try {
    const [payments, balance, ledger, settings, types, customers, refunds, payouts, disputes, pages] = await Promise.all([
      listPayments(),
      getBalance(),
      loadLedger(supabase),
      getSettings(),
      supabase.from("ticket_types").select("price, currency").eq("is_active", true).eq("is_virtual", false).order("sort_order").limit(1),
      tab === "customers" ? listCustomers() : null,
      tab === "refunds" ? listRefunds() : null,
      tab === "payouts" ? listPayouts() : null,
      tab === "disputes" ? listDisputes() : null,
      tab === "pages" ? listPaymentPages() : null,
    ]);
    data = {
      mode: paystackMode() ?? "live",
      balance,
      payments: payments.items,
      truncated: payments.truncated || Boolean(customers?.truncated || refunds?.truncated || payouts?.truncated || disputes?.truncated || pages?.truncated),
      customers: customers?.items,
      refunds: refunds?.items,
      payouts: payouts?.items,
      disputes: disputes?.items,
      pages: pages?.items,
      ledgerByPayment: ledger.byPayment,
      ledgerByCustomer: ledger.byCustomer,
      ticket: { price: types.data?.[0]?.price ?? null, currency: types.data?.[0]?.currency ?? "GHS" },
      event: ticketEvent(settings.event),
    };
  } catch (error) {
    if (!(error instanceof ActionError)) throw error;
    return <PaymentsUnavailable message={error.message} />;
  }

  return <PaymentsView tab={tab} data={data} webhookUrl={webhookUrl} />;
}
