import "server-only";

import { redirect } from "next/navigation";
import { SettingsView } from "@/components/settings/settings-view";
import { requireSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/permissions";
import { siteUrl } from "@/lib/env";
import { readPrefs } from "@/lib/notifications";
import { isPaystackConfigured } from "@/lib/paystack";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export async function SettingsPageContent({ tab = "event" }: { tab?: "event" | "targets" | "tickets" | "notifications" | "email" | "scheduler" }) {
  const { profile, supabase } = await requireSession();
  const admin = hasRole(profile.role, "admin");
  // Workspace settings are for administrators; everyone else manages only their own alerts.
  if (!admin && tab !== "notifications") redirect("/settings/notifications");
  const [settings, ticketTypes, logs, jobs] = await Promise.all([
    getSettings(),
    admin ? supabase.from("ticket_types").select("id, name, price, currency, is_virtual, is_active").order("sort_order") : Promise.resolve({ data: [] }),
    admin ? supabase.from("email_log").select("id, to_email, subject, template, status, error, html, created_at").order("created_at", { ascending: false }).limit(40) : Promise.resolve({ data: [] }),
    admin ? createAdminClient().rpc("scheduler_status") : Promise.resolve({ data: [] }),
  ]);
  // Re-keyed on the values two tabs share (seats = ticket target), so no form is left holding a stale copy after a save.
  return <SettingsView key={JSON.stringify([settings.targets, settings.tickets])} ticketTypes={ticketTypes.data ?? []} paystackConnected={isPaystackConfigured()} settings={settings} prefs={readPrefs(profile.notification_prefs)} logs={logs.data ?? []} jobs={jobs.data ?? []} initialTab={admin ? tab : "notifications"} defaultUrl={siteUrl()} />;
}
