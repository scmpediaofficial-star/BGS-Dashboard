import {
  Activity, CalendarRange, Handshake, LayoutDashboard, ListChecks, Mails, MicVocal, NotebookPen, Settings, Share2, Ticket, UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth/permissions";

export type NavBadgeKey = "overdue" | "actions" | "approvals";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that keep this item highlighted. */
  match?: string[];
  badge?: NavBadgeKey;
  minRole?: Role;
  keywords?: string;
};

export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: null, items: [{ href: "/", label: "Overview", icon: LayoutDashboard, keywords: "home dashboard summary" }] },
  {
    label: "Plan",
    items: [
      { href: "/deliverables", label: "Deliverables", icon: ListChecks, badge: "overdue", keywords: "tasks creatives production pr tracker" },
      { href: "/meetings", label: "Meetings & actions", icon: NotebookPen, badge: "actions", keywords: "minutes action points agenda" },
    ],
  },
  {
    label: "Programme",
    items: [
      { href: "/panels", label: "Panels & speakers", icon: MicVocal, keywords: "panelists moderators questions citations" },
      { href: "/outreach", label: "Outreach", icon: Mails, keywords: "letters embassies institutions invitations" },
    ],
  },
  {
    label: "Commercial",
    items: [
      { href: "/sponsorship", label: "Sponsorship", icon: Handshake, keywords: "sponsors partners pipeline packages" },
      { href: "/tickets", label: "Tickets & access", icon: Ticket, keywords: "sales revenue virtual zoom attendees" },
    ],
  },
  {
    label: "Social Studio",
    items: [
      { href: "/social", label: "Calendar & posts", icon: CalendarRange, match: ["/social/posts", "/social/compose"], badge: "approvals", keywords: "schedule publish linkedin facebook instagram tiktok x wordpress" },
      { href: "/social/accounts", label: "Channels & media", icon: Share2, match: ["/social/media", "/social/accounts"], keywords: "accounts connect library images video" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/activity", label: "Activity", icon: Activity, keywords: "audit log history" },
      { href: "/team", label: "Team & roles", icon: UsersRound, keywords: "users invite permissions admin" },
      { href: "/settings", label: "Settings", icon: Settings, keywords: "event email notifications scheduler integrations profile" },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);

/** The five destinations on the phone tab bar; everything else lives behind "More". */
export const MOBILE_TABS = ["/", "/deliverables", "/social", "/meetings"];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  // "/social" must not light up for "/social/accounts", which is its own item.
  const owned = NAV_ITEMS.filter((other) => other !== item && other.href.startsWith(`${item.href}/`));
  if (owned.some((other) => isActive(other, pathname))) return false;
  return pathname === item.href || pathname.startsWith(`${item.href}/`) || Boolean(item.match?.some((m) => pathname === m || pathname.startsWith(`${m}/`)));
}
