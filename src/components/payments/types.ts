import type { PaymentStatus } from "@/lib/domain";
import type { PaystackBalance, PaystackCustomer, PaystackDispute, PaystackPage, PaystackPayment, PaystackPayout, PaystackRefund } from "@/lib/paystack";

export const PAYMENT_TABS = ["transactions", "customers", "refunds", "payouts", "disputes", "pages"] as const;
export type PaymentTab = (typeof PAYMENT_TABS)[number];
export const TAB_LABEL: Record<PaymentTab, string> = { transactions: "Transactions", customers: "Customers", refunds: "Refunds", payouts: "Payouts", disputes: "Disputes", pages: "Payment pages" };

/** What the ticket ledger holds for a Paystack payment or customer. */
export type LedgerSale = { id: string; status: PaymentStatus; buyer: string; codes: string[] };

export type PaymentsData = {
  mode: "live" | "test";
  balance: PaystackBalance[];
  payments: PaystackPayment[];
  truncated: boolean;
  customers?: PaystackCustomer[];
  refunds?: PaystackRefund[];
  payouts?: PaystackPayout[];
  disputes?: PaystackDispute[];
  pages?: PaystackPage[];
  /** Keyed by Paystack payment id. */
  ledgerByPayment: Record<string, LedgerSale>;
  /** Keyed by customer code and by lower-cased email. */
  ledgerByCustomer: Record<string, LedgerSale[]>;
  ticket: { price: number | null; currency: string };
};

export type { PaystackCustomer, PaystackDispute, PaystackPage, PaystackPayment, PaystackPayout, PaystackRefund };
