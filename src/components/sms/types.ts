/** Who a text message can go to, and what a blast looks like once sent. */

export const GROUPS = {
  ticket_holders: { label: "Ticket holders", description: "People with a paid ticket", source: "Tickets" },
  delegates: { label: "Delegates", description: "Chairperson, speakers, panel members, moderators and guests with a delegate ticket", source: "Tickets" },
  complimentary: { label: "Complimentary guests", description: "Named complimentary tickets", source: "Tickets" },
  panelists: { label: "Confirmed panelists", description: "From Panels & speakers", source: "Programme" },
  outreach: { label: "Outreach contacts", description: "Embassies, institutions and invitees", source: "Outreach" },
  sponsors: { label: "Sponsors", description: "Contact person at each sponsor", source: "Sponsorship" },
  team: { label: "The team", description: "Active dashboard members", source: "Team" },
} as const;
export type GroupKey = keyof typeof GROUPS;
export const GROUP_KEYS = Object.keys(GROUPS) as GroupKey[];

export type Source = GroupKey | "manual" | "csv";
export const SOURCE_LABEL: Record<Source, string> = { ...Object.fromEntries(GROUP_KEYS.map((k) => [k, GROUPS[k].label])) as Record<GroupKey, string>, manual: "Typed in", csv: "Uploaded file" };

export type Recipient = {
  /** Stable key for the row (record id, or the number itself for typed ones). */
  key: string;
  name: string | null;
  /** Normalised number, ready for the gateway. */
  phone: string;
  source: Source;
  /** Organisation, role or whatever helps tell people apart. */
  detail: string | null;
};

export type GroupSummary = { total: number; withPhone: number };
export type Audience = { recipients: Record<GroupKey, Recipient[]>; summary: Record<GroupKey, GroupSummary> };

export type Campaign = {
  id: string; message: string; sender_id: string; audience: string[]; segments: number; recipients: number; sent: number; failed: number;
  status: string; error: string | null; created_at: string; completed_at: string | null; sender: { full_name: string } | null;
};

export type Message = { id: string; campaign_id: string; to_phone: string; name: string | null; source: string; status: string; code: number | null; error: string | null };

/** The composer sends this; the server rebuilds the list itself and never trusts numbers it didn't derive or parse. */
export type SendInput = { message: string; groups: GroupKey[]; manual: string; excluded: string[] };
