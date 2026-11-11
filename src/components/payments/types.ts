import type { TicketEvent } from "@/components/tickets/ticket-art";
import type { TicketLike } from "@/components/tickets/ticket-download";
import type { PaymentStatus } from "@/lib/domain";
import type { RegistrantsReport } from "@/components/payments/registrants";
import type { Checkout, CheckoutSchedule } from "@/lib/paystack-checkout";
import type { PaystackBalance, PaystackCustomer, PaystackDispute, PaystackPage, PaystackPayment, PaystackPayout, PaystackRefund } from "@/lib/paystack";

export const PAYMENT_TABS = ["transactions", "registrants", "customers", "refunds", "payouts", "disputes", "pages"] as const;
export type PaymentTab = (typeof PAYMENT_TABS)[number];
export const TAB_LABEL: Record<PaymentTab, string> = { transactions: "Transactions", registrants: "Registrants", customers: "Customers", refunds: "Refunds", payouts: "Payouts", disputes: "Disputes", pages: "Payment pages" };

/** What the ticket ledger holds for a Paystack payment or customer. */
export type LedgerSale = { id: string; status: PaymentStatus; buyer: string; codes: string[]; /** Live tickets of the sale, ready to download. */ tickets: TicketLike[] };

export type PaymentsData = {
  mode: "live" | "test";
  /** When the ticket ledger was last brought in line with Paystack (ISO time). */
  lastChecked: string | null;
  /** False when automatic import is switched off in Settings. */
  autoImport: boolean;
  balance: PaystackBalance[];
  payments: PaystackPayment[];
  truncated: boolean;
  customers?: PaystackCustomer[];
  refunds?: PaystackRefund[];
  payouts?: PaystackPayout[];
  disputes?: PaystackDispute[];
  pages?: PaystackPage[];
  /** Everyone who paid on Paystack, split into the Zoom and in-person lists (Registrants tab only). */
  registrants?: RegistrantsReport;
  /** Keyed by Paystack payment id. */
  ledgerByPayment: Record<string, LedgerSale>;
  /** Keyed by customer code and by lower-cased email. */
  ledgerByCustomer: Record<string, LedgerSale[]>;
  ticket: { price: number | null; currency: string };
  /** Paid sales in the ticket ledger: what came through Paystack, what was paid outside it (institutions, transfers, cash) and both together. */
  ledgerTotals: { currency: string; paystack: number; paystackTickets: number; outside: number; outsideTickets: number; total: number; totalTickets: number };
  /** Date and venue lines printed on the e-ticket. */
  event: TicketEvent;
  /** Every Paystack payment page and product, open or closed — null when Paystack could not list them. */
  checkouts: Checkout[] | null;
  checkoutSchedule: CheckoutSchedule | null;
};

export type { Checkout, CheckoutSchedule };
export type { PaystackCustomer, PaystackDispute, PaystackPage, PaystackPayment, PaystackPayout, PaystackRefund };
