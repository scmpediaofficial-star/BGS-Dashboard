import {
  Ban, CircleCheck, CircleDashed, CircleDot, CircleX, Eye, FileEdit, Flag, Hourglass, Inbox, LoaderCircle,
  MailCheck, Send, Signal, SignalHigh, SignalLow, SignalMedium, Sparkles, ThumbsUp, Timer, TriangleAlert, Handshake,
  type LucideIcon,
} from "lucide-react";
import type { Tone } from "@/components/ui/badge";
import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];
export type DeliverableStatus = Enums["deliverable_status"];
export type Priority = Enums["priority_level"];
export type PanelistStatus = Enums["panelist_status"];
export type OutreachStatus = Enums["outreach_status"];
export type SponsorStage = Enums["sponsor_stage"];
export type ActionStatus = Enums["action_status"];
export type PaymentStatus = Enums["payment_status"];
export type SocialPostStatus = Enums["social_post_status"];

export type Meta = { label: string; tone: Tone; icon: LucideIcon; /** CSS colour for chart marks */ color: string };

export const DELIVERABLE_STATUS: Record<DeliverableStatus, Meta> = {
  pending: { label: "Pending", tone: "neutral", icon: CircleDashed, color: "var(--neutral)" },
  in_progress: { label: "In progress", tone: "accent", icon: Timer, color: "var(--accent)" },
  in_review: { label: "In review", tone: "warning", icon: Eye, color: "var(--warning)" },
  blocked: { label: "Blocked", tone: "critical", icon: Ban, color: "var(--critical)" },
  completed: { label: "Completed", tone: "good", icon: CircleCheck, color: "var(--good)" },
};
export const DELIVERABLE_STATUS_ORDER: DeliverableStatus[] = ["pending", "in_progress", "in_review", "blocked", "completed"];
/** Left-to-right order inside progress bars: finished work first, then work in flight, then what hasn't started. */
export const DELIVERABLE_PROGRESS_ORDER: DeliverableStatus[] = ["completed", "in_review", "in_progress", "blocked", "pending"];

export const PRIORITY: Record<Priority, Meta> = {
  low: { label: "Low", tone: "neutral", icon: SignalLow, color: "var(--neutral)" },
  medium: { label: "Medium", tone: "neutral", icon: SignalMedium, color: "var(--neutral)" },
  high: { label: "High", tone: "serious", icon: SignalHigh, color: "var(--serious)" },
  critical: { label: "Critical", tone: "critical", icon: Signal, color: "var(--critical)" },
};
export const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"];

export const PANELIST_STATUS: Record<PanelistStatus, Meta> = {
  proposed: { label: "Proposed", tone: "neutral", icon: Sparkles, color: "var(--neutral)" },
  submitted: { label: "Letter submitted", tone: "accent", icon: Send, color: "var(--accent)" },
  confirmed: { label: "Confirmed", tone: "good", icon: CircleCheck, color: "var(--good)" },
  declined: { label: "Declined", tone: "critical", icon: CircleX, color: "var(--critical)" },
};
export const PANELIST_STATUS_ORDER: PanelistStatus[] = ["proposed", "submitted", "confirmed", "declined"];

export const OUTREACH_STATUS: Record<OutreachStatus, Meta> = {
  pending: { label: "Not sent", tone: "neutral", icon: CircleDashed, color: "var(--neutral)" },
  submitted: { label: "Submitted", tone: "accent", icon: Send, color: "var(--accent)" },
  acknowledged: { label: "Acknowledged", tone: "warning", icon: MailCheck, color: "var(--warning)" },
  confirmed: { label: "Confirmed", tone: "good", icon: CircleCheck, color: "var(--good)" },
  declined: { label: "Declined", tone: "critical", icon: CircleX, color: "var(--critical)" },
};
export const OUTREACH_STATUS_ORDER: OutreachStatus[] = ["pending", "submitted", "acknowledged", "confirmed", "declined"];

export const SPONSOR_STAGE: Record<SponsorStage, Meta> = {
  prospect: { label: "Prospect", tone: "neutral", icon: CircleDashed, color: "var(--neutral)" },
  approached: { label: "Approached", tone: "accent", icon: Send, color: "var(--accent)" },
  proposal_sent: { label: "Proposal sent", tone: "accent", icon: FileEdit, color: "var(--accent)" },
  negotiating: { label: "In discussion", tone: "warning", icon: Handshake, color: "var(--warning)" },
  confirmed: { label: "Confirmed", tone: "good", icon: CircleCheck, color: "var(--good)" },
  declined: { label: "Declined", tone: "critical", icon: CircleX, color: "var(--critical)" },
};
export const SPONSOR_STAGE_ORDER: SponsorStage[] = ["prospect", "approached", "proposal_sent", "negotiating", "confirmed", "declined"];

export const ACTION_STATUS: Record<ActionStatus, Meta> = {
  open: { label: "Open", tone: "neutral", icon: CircleDot, color: "var(--neutral)" },
  in_progress: { label: "In progress", tone: "accent", icon: Timer, color: "var(--accent)" },
  done: { label: "Done", tone: "good", icon: CircleCheck, color: "var(--good)" },
};
export const ACTION_STATUS_ORDER: ActionStatus[] = ["open", "in_progress", "done"];

export const PAYMENT_STATUS: Record<PaymentStatus, Meta> = {
  paid: { label: "Paid", tone: "good", icon: CircleCheck, color: "var(--good)" },
  pending: { label: "Awaiting payment", tone: "warning", icon: Hourglass, color: "var(--warning)" },
  complimentary: { label: "Complimentary", tone: "gold", icon: Sparkles, color: "var(--gold)" },
  refunded: { label: "Refunded", tone: "critical", icon: CircleX, color: "var(--critical)" },
};

export const SOCIAL_POST_STATUS: Record<SocialPostStatus, Meta> = {
  draft: { label: "Draft", tone: "neutral", icon: FileEdit, color: "var(--neutral)" },
  pending_approval: { label: "Awaiting approval", tone: "warning", icon: Inbox, color: "var(--warning)" },
  scheduled: { label: "Scheduled", tone: "accent", icon: Timer, color: "var(--accent)" },
  publishing: { label: "Publishing", tone: "accent", icon: LoaderCircle, color: "var(--accent)" },
  published: { label: "Published", tone: "good", icon: ThumbsUp, color: "var(--good)" },
  partial: { label: "Partly published", tone: "serious", icon: TriangleAlert, color: "var(--serious)" },
  failed: { label: "Failed", tone: "critical", icon: CircleX, color: "var(--critical)" },
};

export const TICKET_CHANNELS = [
  { value: "website", label: "Website" },
  { value: "direct", label: "Direct sale" },
  { value: "corporate", label: "Corporate / group" },
  { value: "sponsor", label: "Sponsor allocation" },
  { value: "complimentary", label: "Complimentary" },
  { value: "other", label: "Other" },
] as const;

export const OVERDUE: Meta = { label: "Overdue", tone: "critical", icon: Flag, color: "var(--critical)" };

/** Categorical chart slots (validated order — see globals.css). */
export const CHART_SLOTS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
export const chartSlot = (slot: number) => CHART_SLOTS[(Math.max(1, slot) - 1) % CHART_SLOTS.length];

export type EventSettings = {
  name: string;
  short_name: string;
  theme: string;
  tagline: string;
  starts_at: string;
  venue: string;
  city: string;
  convener: string;
  website: string;
  email: string;
  phone: string;
  whatsapp?: string;
  address?: string;
};

export const DEFAULT_EVENT: EventSettings = {
  name: "Boardroom Governance Summit 2026",
  short_name: "BGS 2026",
  theme: "Board Committees: From Oversight to Impact",
  tagline: "Shaping accountability in the boardrooms",
  starts_at: "2026-10-07T08:00:00+00:00",
  venue: "Labadi Beach Hotel",
  city: "Accra, Ghana",
  convener: "Prof. Douglas Boateng",
  website: "https://boardroomgovsummit.com",
  email: "info@boardroomgovsummit.com",
  phone: "+233 (0)53 145 1470",
};

export type Targets = { tickets: number | null; tickets_note?: string; revenue: number | null; sponsorship: number | null; currency: string };
export const DEFAULT_TARGETS: Targets = { tickets: null, revenue: null, sponsorship: null, currency: "GHS" };
