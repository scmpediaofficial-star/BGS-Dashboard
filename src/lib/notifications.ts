/** Alert categories and per-person delivery preferences (safe to import anywhere). */

export const CATEGORIES = {
  deliverables: { label: "Deliverables", description: "New items, status changes, assignments, comments and checklists." },
  programme: { label: "Panels & speakers", description: "Panelists added, confirmed or declined; questions and citations." },
  outreach: { label: "Outreach", description: "Invitation letters, embassies and institutions." },
  sponsorship: { label: "Sponsorship", description: "Pipeline movement and confirmed sponsors." },
  tickets: { label: "Tickets & virtual access", description: "Sales recorded and access codes sent." },
  meetings: { label: "Meetings & actions", description: "Meetings, minutes and action points." },
  social: { label: "Social Studio", description: "Approvals, scheduled posts, publishing results and account health." },
  team: { label: "Team & access", description: "Invitations, role changes and deactivations." },
  system: { label: "System", description: "Settings, integrations and scheduler changes." },
} as const;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export type EmailMode = "instant" | "digest" | "off";
export const EMAIL_MODES: { value: EmailMode; label: string; hint: string }[] = [
  { value: "instant", label: "Instant", hint: "Email me as it happens" },
  { value: "digest", label: "Daily briefing", hint: "Roll it into the 6 am summary" },
  { value: "off", label: "Off", hint: "In-app only" },
];

export type NotificationPrefs = {
  email: Record<Category, EmailMode>;
  push: boolean;
  digest: boolean;
};

export const DEFAULT_PREFS: NotificationPrefs = {
  email: Object.fromEntries(CATEGORY_KEYS.map((c) => [c, "instant"])) as Record<Category, EmailMode>,
  push: true,
  digest: true,
};

/** Tolerant reader: stored JSON may be partial or predate a new category. */
export function readPrefs(raw: unknown): NotificationPrefs {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<NotificationPrefs>;
  const email = { ...DEFAULT_PREFS.email };
  for (const key of CATEGORY_KEYS) {
    const mode = input.email?.[key];
    if (mode === "instant" || mode === "digest" || mode === "off") email[key] = mode;
  }
  return {
    email,
    push: typeof input.push === "boolean" ? input.push : DEFAULT_PREFS.push,
    digest: typeof input.digest === "boolean" ? input.digest : DEFAULT_PREFS.digest,
  };
}
