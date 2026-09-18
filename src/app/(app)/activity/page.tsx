import type { Metadata } from "next";
import { ActivityView } from "@/components/activity/activity-view";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const { supabase } = await requireSession();
  const { data } = await supabase.from("activity_log").select("id, actor_name, summary, link, category, created_at").order("created_at", { ascending: false }).limit(500);
  return <ActivityView entries={data ?? []} />;
}
