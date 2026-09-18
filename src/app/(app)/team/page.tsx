import type { Metadata } from "next";
import { TeamView } from "@/components/team/team-view";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Team & roles" };

export default async function TeamPage() {
  const { supabase } = await requireRole("admin");
  const { data } = await supabase.from("profiles").select("id, full_name, email, role, organization, job_title, is_active, invited_at, last_seen_at, avatar_url").order("full_name");
  return <TeamView members={data ?? []} />;
}
