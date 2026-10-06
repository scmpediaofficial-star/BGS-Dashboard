import "server-only";

import type { Audience, GroupKey, Recipient } from "@/components/sms/types";
import { GROUP_KEYS } from "@/components/sms/types";
import type { Session } from "@/lib/auth/session";
import { normalisePhone } from "@/lib/sms/text";

/**
 * Everyone the dashboard knows a phone number for, by list. Read with the
 * user's client, so row-level security decides what each person may address.
 * The page shows this; the Server Action rebuilds it rather than trusting the browser.
 */
export async function loadAudience(supabase: Session["supabase"], countryCode: string): Promise<Audience> {
  const [tickets, panelists, outreach, sponsors, team] = await Promise.all([
    supabase.from("tickets").select("id, kind, holder_name, holder_phone, organization, role_label").neq("status", "void").order("seq"),
    supabase.from("panelists").select("id, full_name, phone, organization").eq("status", "confirmed").order("sort_order"),
    supabase.from("outreach_contacts").select("id, name, contact_person, phone").order("name"),
    supabase.from("sponsors").select("id, organization, contact_person, phone").order("organization"),
    supabase.from("profiles").select("id, full_name, phone, organization").eq("is_active", true).order("full_name"),
  ]);

  const recipients = Object.fromEntries(GROUP_KEYS.map((k) => [k, [] as Recipient[]])) as Record<GroupKey, Recipient[]>;
  const summary = Object.fromEntries(GROUP_KEYS.map((k) => [k, { total: 0, withPhone: 0 }])) as Audience["summary"];

  const add = (group: GroupKey, key: string, name: string | null, rawPhone: string | null, detail: string | null) => {
    summary[group].total += 1;
    const phone = normalisePhone(rawPhone, countryCode);
    if (!phone) return;
    summary[group].withPhone += 1;
    recipients[group].push({ key, name: name?.trim() || null, phone, source: group, detail: detail?.trim() || null });
  };

  for (const t of tickets.data ?? []) {
    const group: GroupKey = t.kind === "paid" ? "ticket_holders" : t.kind === "delegate" ? "delegates" : "complimentary";
    if (group === "complimentary" && !t.holder_name) continue; // blank complimentary tickets have nobody to text
    add(group, t.id, t.holder_name, t.holder_phone, [t.role_label, t.organization].filter(Boolean).join(" · ") || null);
  }
  for (const p of panelists.data ?? []) add("panelists", p.id, p.full_name, p.phone, p.organization);
  for (const c of outreach.data ?? []) add("outreach", c.id, c.contact_person || c.name, c.phone, c.contact_person ? c.name : null);
  for (const s of sponsors.data ?? []) add("sponsors", s.id, s.contact_person || s.organization, s.phone, s.contact_person ? s.organization : null);
  for (const m of team.data ?? []) add("team", m.id, m.full_name, m.phone, m.organization);

  return { recipients, summary };
}
