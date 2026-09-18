import "server-only";

import { redirect } from "next/navigation";
import { SettingsView } from "@/components/settings/settings-view";
import { requireSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/permissions";
import { siteUrl } from "@/lib/env";
import { readPrefs } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export async function SettingsPageContent({ tab = "event" }: { tab?: "event" | "targets" | "notifications" | "email" | "scheduler" }) {
  const { profile, supabase } = await requireSession();
  const admin = hasRole(profile.role, "admin");
  // Workspace settings are for administrators; everyone else manages only their own alerts.
  if (!admin && tab !== "notifications") redirect("/settings/notifications");
  const [settings, logs, jobs] = await Promise.all([
    getSettings(),
    admin ? supabase.from("email_log").select("id, to_email, subject, template, status, error, html, created_at").order("created_at", { ascending: false }).limit(40) : Promise.resolve({ data: [] }),
    admin ? createAdminClient().rpc("scheduler_status") : Promise.resolve({ data: [] }),
  ]);
  return <SettingsView settings={settings} prefs={readPrefs(profile.notification_prefs)} logs={logs.data ?? []} jobs={jobs.data ?? []} initialTab={admin ? tab : "notifications"} defaultUrl={siteUrl()} />;
}
