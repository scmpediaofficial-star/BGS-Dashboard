import type { PaymentStatus, TicketKind, TicketStatus } from "@/lib/domain";
import type { TicketFace } from "@/components/tickets/ticket-art";

export type TicketType = { id: string; name: string; price: number | null; currency: string; is_virtual: boolean; is_active: boolean };

export type Sale = {
  id: string; ticket_type_id: string; buyer_name: string; buyer_email: string | null; buyer_phone: string | null; organization: string | null;
  country: string; quantity: number; amount: number; currency: string; channel: string; payment_status: PaymentStatus; reference: string | null;
  sold_at: string; access_code: string | null; access_sent_at: string | null; notes: string | null; paystack_id: number | null; paystack_customer_code: string | null;
  ticket_type: { name: string; is_virtual: boolean } | null;
};

export type TicketRow = {
  id: string; seq: number; code: string; kind: TicketKind; status: TicketStatus; holder_name: string | null; holder_email: string | null; holder_phone: string | null;
  organization: string | null; role_label: string | null; sale_id: string | null; panelist_id: string | null; notes: string | null; checked_in_at: string | null; created_at: string;
};

/** Everyone expected in the room, by how they got their place. Void tickets are never counted. */
export type { Attendance } from "@/lib/attendance";

export const toFace = (t: Pick<TicketRow, "code" | "kind" | "holder_name" | "organization" | "role_label">): TicketFace => ({
  code: t.code, kind: t.kind, name: t.holder_name, organization: t.organization, roleLabel: t.role_label,
});
