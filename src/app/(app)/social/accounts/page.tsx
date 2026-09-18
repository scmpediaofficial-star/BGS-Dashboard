import type { Metadata } from "next";
import { SocialAccountsView } from "@/components/social/social-accounts-view";
import { can } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { listApps } from "@/lib/social/accounts";

export const metadata: Metadata = { title: "Channels & media" };

export default async function SocialAccountsPage({ searchParams }: PageProps<"/social/accounts">) {
  const { role, supabase } = await requireSession();
  const params = await searchParams;
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null);

  const [accounts, media, apps] = await Promise.all([
    supabase.from("social_accounts").select("id, provider, display_name, username, avatar_url, account_type, profile_url, status, status_detail, token_expires_at, created_at").order("created_at"),
    supabase.from("social_media").select("id, url, jpeg_url, file_name, mime_type, alt_text, size_bytes, width, height").order("created_at", { ascending: false }).limit(200),
    // Which developer apps exist (IDs only — secrets never leave the server). Admins only.
    can(role, "social.accounts") ? listApps() : Promise.resolve({}),
  ]);

  return (
    <SocialAccountsView
      accounts={accounts.data ?? []}
      media={media.data ?? []}
      apps={apps}
      notice={{ connected: pick("connected"), provider: pick("provider"), error: pick("error"), setup: pick("setup") }}
    />
  );
}
