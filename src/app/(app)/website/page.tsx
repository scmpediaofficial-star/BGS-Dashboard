import type { Metadata } from "next";
import { ArticlesView } from "@/components/website/articles-view";
import { requireSession } from "@/lib/auth/session";
import { isoDay } from "@/lib/utils";

export const metadata: Metadata = { title: "News articles" };

export default async function WebsiteArticlesPage() {
  const { supabase } = await requireSession();

  const { data } = await supabase
    .from("website_articles")
    .select("id, slug, title, category, excerpt, body, cover_url, cover_alt, author, status, published_at, created_at, updated_at, created_by, creator:profiles!website_articles_created_by_fkey(full_name), editor:profiles!website_articles_updated_by_fkey(full_name)")
    .order("published_at", { ascending: false, nullsFirst: true })
    .order("updated_at", { ascending: false });

  return <ArticlesView articles={data ?? []} today={isoDay()} now={new Date().toISOString()} />;
}
