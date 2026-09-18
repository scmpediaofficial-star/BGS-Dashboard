import type { Database } from "@/types/database";

export type Role = Database["public"]["Enums"]["user_role"];

export const ROLES: Role[] = ["super_admin", "admin", "manager", "contributor", "viewer"];

const RANK: Record<Role, number> = { super_admin: 5, admin: 4, manager: 3, contributor: 2, viewer: 1 };

export const ROLE_META: Record<Role, { label: string; summary: string; can: string[] }> = {
  super_admin: {
    label: "Super Admin",
    summary: "Owns the workspace. Full control, including other administrators.",
    can: ["Everything an Admin can do", "Promote, demote or remove administrators", "Cannot be removed by anyone else"],
  },
  admin: {
    label: "Admin",
    summary: "Runs the workspace: people, integrations and settings.",
    can: ["Invite people and assign roles", "Connect social accounts and developer apps", "Change event settings, scheduler and email"],
  },
  manager: {
    label: "Manager",
    summary: "Leads delivery. Approves and publishes.",
    can: ["Approve, schedule and publish social posts", "Record ticket sales and send virtual access", "Delete records"],
  },
  contributor: {
    label: "Contributor",
    summary: "Does the work: updates trackers and drafts content.",
    can: ["Create and update deliverables, panelists, outreach and sponsors", "Draft social posts and submit them for approval", "Upload media and comment"],
  },
  viewer: {
    label: "Viewer",
    summary: "Read-only access for stakeholders.",
    can: ["See every tracker, report and calendar", "Receive alerts and digests", "Cannot change anything"],
  },
};

/**
 * Capabilities and the minimum role that holds them. The same ladder is enforced
 * in Postgres (supabase/migrations/*_security.sql) — this map only decides what
 * the interface offers, the database decides what is allowed.
 */
export const CAPABILITIES = {
  "records.write": "contributor",
  "records.delete": "manager",
  "comments.write": "contributor",
  "tickets.manage": "manager",
  "social.draft": "contributor",
  "social.publish": "manager",
  "social.accounts": "admin",
  "team.manage": "admin",
  "settings.manage": "admin",
  "email.log": "admin",
} as const satisfies Record<string, Role>;

export type Capability = keyof typeof CAPABILITIES;

export function roleRank(role: Role | null | undefined): number {
  return role ? RANK[role] : 0;
}

export function hasRole(role: Role | null | undefined, min: Role): boolean {
  return roleRank(role) >= RANK[min];
}

export function can(role: Role | null | undefined, capability: Capability): boolean {
  return hasRole(role, CAPABILITIES[capability]);
}

/** Roles that `actor` may grant to, or take from, another person. */
export function assignableRoles(actor: Role | null | undefined): Role[] {
  if (actor === "super_admin") return ROLES;
  if (actor === "admin") return ROLES.filter((r) => r !== "super_admin");
  return [];
}

/** Whether `actor` may edit the account of someone holding `target`. */
export function canManageUser(actor: Role | null | undefined, target: Role): boolean {
  if (actor === "super_admin") return true;
  if (actor === "admin") return target !== "super_admin";
  return false;
}
