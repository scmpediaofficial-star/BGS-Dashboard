import type { Metadata } from "next";
import { SocialView } from "@/components/social/social-view";
import { requireSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { isoDay } from "@/lib/utils";

export const metadata: Metadata = { title: "Social Studio" };

export default async function SocialPage() {
  const { supabase } = await requireSession();
  const [posts, accounts, settings] = await Promise.all([
    supabase
      .from("social_posts")
      .select("id, content, campaign, media_ids, status, scheduled_at, published_at, created_at, author:profiles!social_posts_author_id_fkey(full_name, avatar_url), targets:social_post_targets(status, account:social_accounts(provider, display_name))")
      .order("created_at", { ascending: false })
      .limit(400),
    supabase.from("social_accounts").select("id", { count: "exact", head: true }).eq("status", "active"),
    getSettings(),
  ]);
  return <SocialView posts={posts.data ?? []} channelCount={accounts.count ?? 0} today={isoDay()} eventDay={isoDay(settings.event.starts_at)} />;
}
