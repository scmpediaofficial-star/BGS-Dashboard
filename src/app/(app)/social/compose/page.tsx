import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Composer } from "@/components/social/composer";
import { requireSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { daysUntil, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Compose" };

export default async function ComposePage({ searchParams }: PageProps<"/social/compose">) {
  const { supabase } = await requireSession();
  const params = await searchParams;
  const postId = typeof params.post === "string" ? params.post : null;
  const day = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;

  const [accounts, media, templates, hashtags, scheduled, settings, post] = await Promise.all([
    supabase.from("social_accounts").select("id, provider, display_name, username, avatar_url, status").order("created_at"),
    supabase.from("social_media").select("id, url, jpeg_url, file_name, mime_type, alt_text, size_bytes, width, height").order("created_at", { ascending: false }).limit(200),
    supabase.from("social_templates").select("id, name, content").order("name"),
    supabase.from("social_hashtag_groups").select("id, name, hashtags").order("name"),
    supabase.from("social_posts").select("id, scheduled_at").eq("status", "scheduled").not("scheduled_at", "is", null),
    getSettings(),
    postId
      ? supabase.from("social_posts").select("id, content, link_url, campaign, notes, tags, media_ids, status, scheduled_at, published_at, rejection_note, author_id, author:profiles!social_posts_author_id_fkey(full_name), approver:profiles!social_posts_approver_id_fkey(full_name), targets:social_post_targets(id, account_id, content_override, options, status, external_url, error, published_at)").eq("id", postId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (postId && !post.data) notFound();

  const { event, social_queue } = settings;
  return (
    <Composer
      post={post.data}
      accounts={accounts.data ?? []}
      media={media.data ?? []}
      templates={templates.data ?? []}
      hashtagGroups={hashtags.data ?? []}
      taken={(scheduled.data ?? []).filter((p) => p.id !== postId).map((p) => p.scheduled_at!)}
      queue={social_queue}
      startDay={day}
      variables={{ event: event.name, days: Math.max(0, daysUntil(event.starts_at) ?? 0), date: formatDate(event.starts_at), venue: `${event.venue}, ${event.city}`, website: event.website.replace(/^https?:\/\//, ""), theme: event.theme }}
    />
  );
}
