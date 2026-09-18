import type { Metadata } from "next";
import { DeliverablesView } from "@/components/deliverables/deliverables-view";
import { requireSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { isoDay } from "@/lib/utils";

export const metadata: Metadata = { title: "Deliverables" };

export default async function DeliverablesPage() {
  const { supabase } = await requireSession();

  const [workstreams, deliverables, people, settings] = await Promise.all([
    supabase.from("workstreams").select("id, slug, name, description, color_slot").order("sort_order"),
    supabase
      .from("deliverables")
      .select("id, workstream_id, section, title, quantity, responsibility, assignee_id, status, priority, due_date, comment, checklist, sort_order, updated_at, assignee:profiles!deliverables_assignee_id_fkey(id, full_name, avatar_url)")
      .order("sort_order"),
    supabase.from("profiles").select("id, full_name, avatar_url, organization").eq("is_active", true).order("full_name"),
    getSettings(),
  ]);

  return (
    <DeliverablesView
      workstreams={workstreams.data ?? []}
      deliverables={deliverables.data ?? []}
      people={people.data ?? []}
      organizations={settings.organizations}
      today={isoDay()}
    />
  );
}
