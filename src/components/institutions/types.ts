import type { PaymentStatus } from "@/lib/domain";

export type Institution = { id: string; name: string; contact_person: string | null; email: string | null; phone: string | null; fee: number | null; notes: string | null; created_at: string };

/** A sale paid outside Paystack, with the ticket numbers issued for it. */
export type MemberSale = {
  id: string; buyer_name: string; buyer_email: string | null; buyer_phone: string | null; organization: string | null; amount: number; currency: string; quantity: number;
  channel: string; payment_status: PaymentStatus; paystack_customer_code: string | null; institution_id: string | null; sold_at: string; codes: string[];
};
