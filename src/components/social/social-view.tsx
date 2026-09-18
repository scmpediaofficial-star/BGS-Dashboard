"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, ImageIcon, Inbox, PenSquare, Plus, Share2, Star } from "lucide-react";
import { BrandIcon } from "@/components/social/brand-icon";
import { useViewer } from "@/components/shell/session-context";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, FilterChip, PageHeader } from "@/components/ui/misc";
import { SOCIAL_POST_STATUS, type SocialPostStatus } from "@/lib/domain";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { isProviderId, type ProviderId } from "@/lib/social/catalog";
import { cn, formatDate, formatTime, isoDay, relativeDay, timeAgo } from "@/lib/utils";

type Post = {
  id: string; content: string; campaign: string | null; media_ids: string[]; status: SocialPostStatus; scheduled_at: string | null; published_at: string | null; created_at: string;
  author: { full_name: string; avatar_url: string | null } | null;
  targets: { status: string; account: { provider: string; display_name: string } | null }[];
};

const TABS = [
  { key: "calendar", label: "Calendar", match: null },
  { key: "approvals", label: "Approvals", match: ["pending_approval"] },
  { key: "queue", label: "Queue", match: ["scheduled", "publishing"] },
  { key: "drafts", label: "Drafts", match: ["draft"] },
  { key: "published", label: "Published", match: ["published"] },
  { key: "problems", label: "Needs attention", match: ["failed", "partial"] },
] as const;

const CHIP: Record<SocialPostStatus, string> = {
  draft: "bg-neutral-soft text-neutral-ink", pending_approval: "bg-warning-soft text-warning-ink", scheduled: "bg-accent-soft text-accent-ink", publishing: "bg-accent-soft text-accent-ink",
  published: "bg-good-soft text-good-ink", partial: "bg-serious-soft text-serious-ink", failed: "bg-critical-soft text-critical-ink",
};

const when = (p: Post) => p.published_at ?? p.scheduled_at;
const providersOf = (p: Post) => [...new Set(p.targets.map((t) => t.account?.provider).filter((x): x is string => Boolean(x) && isProviderId(x!)))] as ProviderId[];

function Channels({ post, max = 4 }: { post: Post; max?: number }) {
  const list = providersOf(post);
  if (!list.length) return <span className="text-[11px] text-ink-3">No channel</span>;
  return <span className="flex items-center -space-x-1">{list.slice(0, max).map((p) => <BrandIcon key={p} provider={p} size="xs" className="ring-2 ring-surface" />)}{list.length > max && <span className="pl-2 text-[11px] font-semibold text-ink-3">+{list.length - max}</span>}</span>;
}

export function SocialView({ posts, channelCount, today, eventDay }: { posts: Post[]; channelCount: number; today: string; eventDay: string }) {
  const { can } = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useRealtimeRefresh(["social_posts", "social_post_targets"]);

  const tab = TABS.find((t) => t.key === params.get("tab")) ?? TABS[0];
  const setTab = (key: string) => router.replace(key === "calendar" ? pathname : `${pathname}?tab=${key}`, { scroll: false });
  const [cursor, setCursor] = useState(() => today.slice(0, 7)); // YYYY-MM

  const count = (match: readonly string[] | null) => (match ? posts.filter((p) => match.includes(p.status)).length : posts.length);
  const listed = tab.match ? posts.filter((p) => (tab.match as readonly string[]).includes(p.status)).sort((a, b) => (when(a) ?? a.created_at).localeCompare(when(b) ?? b.created_at) * (tab.key === "queue" ? 1 : -1)) : [];

  // ── Calendar model (weeks start on Monday) ────────────────────────────────
  const { cells, byDay, label } = useMemo(() => {
    const [year, month] = cursor.split("-").map(Number);
    const first = new Date(Date.UTC(year, month - 1, 1, 12));
    const lead = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
    const grid: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${cursor}-${String(i + 1).padStart(2, "0")}`)];
    while (grid.length % 7) grid.push(null);
    const map = new Map<string, Post[]>();
    for (const post of posts) {
      const at = when(post);
      if (!at) continue;
      const day = isoDay(at);
      if (day.startsWith(cursor)) map.set(day, [...(map.get(day) ?? []), post].sort((a, b) => when(a)!.localeCompare(when(b)!)));
    }
    return { cells: grid, byDay: map, label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first) };
  }, [cursor, posts]);

  const shift = (delta: number) => {
    const [y, m] = cursor.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setCursor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const Row = ({ post }: { post: Post }) => {
    const meta = SOCIAL_POST_STATUS[post.status];
    const at = when(post);
    return (
      <li>
        <Link href={`/social/compose?post=${post.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
          <Avatar name={post.author?.full_name ?? "Unknown"} src={post.author?.avatar_url} size="sm" className="max-sm:hidden" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink sm:line-clamp-1">{post.content || "Media-only post"}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-3">
              <Channels post={post} />
              {post.media_ids.length > 0 && <span className="flex items-center gap-1"><ImageIcon className="size-3.5" aria-hidden />{post.media_ids.length}</span>}
              {post.campaign && <span className="truncate">· {post.campaign}</span>}
              <span>· {post.author?.full_name ?? "Unknown"}</span>
            </span>
          </span>
          <span className="shrink-0 text-right">
            <Badge tone={meta.tone} icon={meta.icon} size="sm">{meta.label}</Badge>
            <span className="tabular mt-1 block text-[11px] text-ink-3">{at ? `${relativeDay(at)} · ${formatTime(at)}` : `Edited ${timeAgo(post.created_at)}`}</span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Social Studio"
        title="Calendar & posts"
        description="Plan the countdown, get posts approved, and let the scheduler publish them to every connected channel."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/social/accounts"><Share2 /> Channels <span className="tabular rounded-full bg-surface-3 px-1.5 text-[10.5px] text-ink-3">{channelCount}</span></Link></Button>
            {can("social.draft") && <Button asChild><Link href="/social/compose"><PenSquare /> Compose</Link></Button>}
          </>
        }
      />

      {channelCount === 0 && (
        <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div><h2 className="text-sm font-bold text-ink">No channels connected yet</h2><p className="mt-0.5 text-[13px] text-ink-3">You can draft and plan now. Connect LinkedIn, Facebook, Instagram, X, TikTok or the website when you&apos;re ready — or add the practice channel to rehearse.</p></div>
          <Button asChild variant="outline" className="shrink-0"><Link href="/social/accounts">Open channels</Link></Button>
        </Card>
      )}

      <div className="scroll-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map((t) => <FilterChip key={t.key} active={tab.key === t.key} count={t.match ? count(t.match) : undefined} onClick={() => setTab(t.key)}>{t.label}</FilterChip>)}
      </div>

      {tab.key === "calendar" ? (
        <Card className="overflow-hidden">
          <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></Button>
              <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></Button>
              <h2 className="ml-1.5 text-[15px] font-bold text-ink" aria-live="polite">{label}</h2>
            </div>
            <Button variant="outline" size="sm" onClick={() => setCursor(today.slice(0, 7))}>Today</Button>
          </header>

          {/* ≥ md: month grid */}
          <div className="hidden md:block">
            <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wide text-ink-3">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2.5 py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((day, index) => {
                const items = day ? byDay.get(day) ?? [] : [];
                return (
                  <div key={day ?? `pad-${index}`} className={cn("group relative min-h-[118px] border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0", !day && "bg-surface-2/60", day === today && "bg-accent-soft/40")}>
                    {day && (
                      <>
                        <div className="mb-1 flex items-center justify-between px-1">
                          <span className={cn("tabular text-xs font-semibold", day === today ? "grid size-6 place-items-center rounded-full bg-accent text-accent-fg" : day < today ? "text-ink-3" : "text-ink-2")}>{Number(day.slice(8))}</span>
                          {day === eventDay && <Badge tone="gold" size="sm" icon={Star}>Summit</Badge>}
                          {can("social.draft") && day >= today && (
                            <Link href={`/social/compose?date=${day}`} aria-label={`Compose for ${formatDate(day)}`} className="grid size-5 place-items-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-surface-3 hover:text-accent-ink focus-visible:opacity-100 group-hover:opacity-100"><Plus className="size-3.5" /></Link>
                          )}
                        </div>
                        <ul className="grid gap-1">
                          {items.slice(0, 3).map((post) => (
                            <li key={post.id}>
                              <Link href={`/social/compose?post=${post.id}`} title={post.content} className={cn("flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-[filter] hover:brightness-95", CHIP[post.status])}>
                                <span className="tabular shrink-0">{formatTime(when(post))}</span>
                                <span className="min-w-0 flex-1 truncate font-medium">{post.content || "Media post"}</span>
                                <Channels post={post} max={2} />
                              </Link>
                            </li>
                          ))}
                          {items.length > 3 && <li className="px-1.5 text-[11px] font-semibold text-ink-3">+{items.length - 3} more</li>}
                        </ul>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* < md: agenda */}
          <div className="md:hidden">
            {[...byDay.keys()].length === 0 ? (
              <EmptyState icon={CalendarDays} title={`Nothing planned in ${label}`} description="Compose a post and give it a time to see it here." />
            ) : (
              <ul className="divide-y divide-line">
                {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => (
                  <li key={day}>
                    <h3 className={cn("flex items-center gap-2 bg-surface-2 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide", day === today ? "text-accent-ink" : "text-ink-3")}>{formatDate(day, { weekday: true, year: false })}{day === eventDay && <Badge tone="gold" size="sm" icon={Star}>Summit</Badge>}</h3>
                    <ul className="divide-y divide-line">{items.map((post) => <Row key={post.id} post={post} />)}</ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5">
            {(["pending_approval", "scheduled", "published", "failed"] as const).map((s) => { const m = SOCIAL_POST_STATUS[s]; return <span key={s} className="flex items-center gap-1.5 text-[11px] text-ink-3"><m.icon className="size-3.5" aria-hidden />{m.label}</span>; })}
            <span className="ml-auto text-[11px] text-ink-3">Times shown in Accra (GMT)</span>
          </footer>
        </Card>
      ) : listed.length === 0 ? (
        <Card>
          <EmptyState
            icon={tab.key === "approvals" ? Inbox : PenSquare}
            title={tab.key === "approvals" ? "Nothing is waiting for approval" : tab.key === "problems" ? "No failed posts" : `No ${tab.label.toLowerCase()} yet`}
            description={tab.key === "approvals" ? "When a contributor submits a post, managers are alerted and it appears here." : tab.key === "problems" ? "If a network rejects a post, it lands here with the reason and a retry button." : "Compose a post to get started."}
            action={can("social.draft") && tab.key !== "problems" ? <Button asChild><Link href="/social/compose"><PenSquare /> Compose</Link></Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden"><ul className="divide-y divide-line">{listed.map((post) => <Row key={post.id} post={post} />)}</ul></Card>
      )}
    </>
  );
}
