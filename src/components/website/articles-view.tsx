"use client";

import { useNavRouter } from "@/lib/hooks/use-nav-router";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ExternalLink, Images, Newspaper, Plus, Search, X } from "lucide-react";
import { publishArticle, unpublishArticle } from "@/app/(app)/website/actions";
import { SegmentedBar } from "@/components/charts/segmented-bar";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { EmptyState, FilterChip, PageHeader } from "@/components/ui/misc";
import { ArticleSheet } from "@/components/website/article-sheet";
import { ArticleTable } from "@/components/website/article-table";
import { ARTICLE_CATEGORIES, WEBSITE_URL, articlePath, articleState, type Article, type ArticleState } from "@/components/website/types";
import { ARTICLE_SCHEDULED, ARTICLE_STATUS, ARTICLE_STATUS_ORDER, type ArticleStatus } from "@/lib/domain";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { formatDate, truncate } from "@/lib/utils";

type StatusFilter = "all" | ArticleStatus;

const STATE_META = { published: ARTICLE_STATUS.published, scheduled: ARTICLE_SCHEDULED, draft: ARTICLE_STATUS.draft } as const;
const STATE_ORDER: ArticleState[] = ["published", "scheduled", "draft"];

type Props = { articles: Article[]; today: string; now: string };

export function ArticlesView({ articles, today, now }: Props) {
  const { can } = useViewer();
  const router = useNavRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useRealtimeRefresh(["website_articles"]);

  // ── State that lives in the URL, so filtered views and open articles are shareable links ──
  const requestedStatus = params.get("status");
  const status: StatusFilter = requestedStatus === "draft" || requestedStatus === "published" ? requestedStatus : "all";
  const requestedCategory = params.get("category");
  const category = ARTICLE_CATEGORIES.find((c) => c === requestedCategory) ?? "all";
  const openId = params.get("item");
  const creating = params.get("new") === "1";

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (category !== "all" && a.category !== category) return false;
      if (term && ![a.title, a.excerpt, a.author, a.slug, a.category].some((v) => v?.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [articles, status, category, query]);

  const states = useMemo(() => articles.map((a) => articleState(a, now)), [articles, now]);
  const countState = (s: ArticleState) => states.filter((x) => x === s).length;
  const latest = articles.find((a, i) => states[i] === "published");
  const clearFilters = () => { setQuery(""); setParams({ status: null, category: null }); };

  // Publishing from the list asks first: it changes the public website.
  const [pending, setPending] = useState<{ article: Article; next: ArticleStatus } | null>(null);
  const [publish, publishing] = useAction(publishArticle, { onSuccess: () => setPending(null) });
  const [unpublish, unpublishing] = useAction(unpublishArticle, { onSuccess: () => setPending(null) });
  const onStatus = (id: string, next: ArticleStatus) => {
    const article = articles.find((a) => a.id === id);
    if (article && article.status !== next) setPending({ article, next });
  };

  const selected = openId ? articles.find((a) => a.id === openId) ?? null : null;
  const pendingFuture = pending?.article.published_at ? Date.parse(pending.article.published_at) > Date.parse(now) : false;

  return (
    <>
      <PageHeader
        eyebrow="Website"
        title="News articles"
        description="Announcements, speeches, insights and summit news on the public website. Drafts stay here until a manager publishes them."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/website/gallery"><Images /> Gallery</Link></Button>
            <Button asChild variant="outline"><a href={`${WEBSITE_URL}/news/`} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open website</a></Button>
            {can("website.write") && <Button onClick={() => setParams({ new: "1", item: null })}><Plus /> New article</Button>}
          </>
        }
      />

      {/* Where the website stands */}
      <Card className="mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-3">On the website now</p>
            <p className="mt-0.5 text-[13px] text-ink-2">
              <strong className="text-xl font-extrabold text-ink">{countState("published")}</strong> {countState("published") === 1 ? "article" : "articles"}
              {latest && <> · latest <span className="font-semibold text-ink">“{truncate(latest.title, 60)}”</span>, {formatDate(latest.published_at)}</>}
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {STATE_ORDER.map((s) => (
              <li key={s} className="flex items-center gap-1.5 text-xs text-ink-2">
                <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: STATE_META[s].color }} />
                {STATE_META[s].label} <span className="tabular font-semibold text-ink">{countState(s)}</span>
              </li>
            ))}
          </ul>
        </div>
        <SegmentedBar
          className="mt-3"
          label="All articles"
          segments={STATE_ORDER.map((s) => ({ key: s, label: STATE_META[s].label, value: countState(s), color: STATE_META[s].color }))}
        />
      </Card>

      {/* One filter area above everything it scopes */}
      <div className="mb-4 grid gap-2.5">
        <div className="scroll-none -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <div role="group" aria-label="Status" className="flex shrink-0 gap-2">
            <FilterChip active={status === "all"} count={articles.length} onClick={() => setParams({ status: null })}>All</FilterChip>
            {ARTICLE_STATUS_ORDER.map((s) => (
              <FilterChip key={s} active={status === s} count={articles.filter((a) => a.status === s).length} onClick={() => setParams({ status: s })}>{ARTICLE_STATUS[s].label}</FilterChip>
            ))}
          </div>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
          <div role="group" aria-label="Category" className="flex shrink-0 gap-2">
            <FilterChip active={category === "all"} onClick={() => setParams({ category: null })}>Every category</FilterChip>
            {ARTICLE_CATEGORIES.map((c) => (
              <FilterChip key={c} active={category === c} count={articles.filter((a) => a.category === c).length} onClick={() => setParams({ category: c })}>{c}</FilterChip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, excerpts and authors…" aria-label="Search articles" className="pl-9" />
          </div>
          {(status !== "all" || category !== "all" || query) && <Button variant="ghost" size="sm" onClick={clearFilters}><X /> Clear</Button>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Newspaper}
            title={articles.length ? "No articles match" : "No articles yet"}
            description={articles.length ? "Try another status or category, or clear the search." : "Write the first article. It stays a draft until a manager publishes it."}
            action={articles.length
              ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
              : can("website.write") ? <Button onClick={() => setParams({ new: "1" })}><Plus /> New article</Button> : undefined}
          />
        </Card>
      ) : (
        <ArticleTable items={filtered} now={now} canPublish={can("website.publish")} onOpen={(id) => setParams({ item: id, new: null })} onStatus={onStatus} />
      )}

      <p className="mt-3 text-xs text-ink-3">Showing {filtered.length} of {articles.length} articles</p>

      <ArticleSheet
        key={selected?.id ?? (creating ? "new" : "closed")}
        open={Boolean(selected) || creating}
        article={selected}
        articles={articles}
        today={today}
        now={now}
        onClose={() => setParams({ item: null, new: null })}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(next) => !next && setPending(null)}
        title={pending?.next === "published" ? (pendingFuture ? "Schedule this article?" : "Publish this article?") : "Take this article off the website?"}
        description={pending
          ? pending.next === "published"
            ? `“${truncate(pending.article.title, 80)}” will ${pendingFuture ? `appear on the website on ${formatDate(pending.article.published_at)}` : "go live on the website"} at ${articlePath(pending.article.slug, pending.article.published_at ?? `${today}T12:00:00Z`)}. The team is told.`
            : `“${truncate(pending.article.title, 80)}” becomes a draft again and disappears from the website. Links to it stop working until it is published again.`
          : ""}
        confirmLabel={pending?.next === "published" ? (pendingFuture ? "Schedule" : "Publish") : "Unpublish"}
        destructive={pending?.next === "draft"}
        loading={publishing || unpublishing}
        onConfirm={() => {
          if (!pending) return;
          if (pending.next === "published") publish(pending.article.id);
          else unpublish(pending.article.id);
        }}
      />
    </>
  );
}
