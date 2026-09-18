import type { Metadata } from "next";
import { MeetingsView } from "@/components/meetings/meetings-view";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Meetings & actions" };

export default async function MeetingsPage() {
  const { supabase } = await requireSession();
  const [meetings, actions, people] = await Promise.all([
    supabase.from("meetings").select("id, title, meeting_at, venue, mode, status, join_url, attendees, sections").order("meeting_at", { ascending: false }),
    supabase.from("action_items").select("id, meeting_id, title, owner_label, assignee_id, due_date, due_label, status, notes").order("sort_order"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);
  return <MeetingsView meetings={meetings.data ?? []} actions={actions.data ?? []} people={people.data ?? []} />;
}
