"use client";

import { useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { StatusMenu } from "@/components/shared/status-menu";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { articleMeta, articleState, articleUrl, websiteAsset, type Article } from "@/components/website/types";
import { ARTICLE_SCHEDULED, ARTICLE_STATUS, ARTICLE_STATUS_ORDER, type ArticleStatus, type Meta } from "@/lib/domain";
import { cn, formatDate, timeAgo } from "@/lib/utils";

type Props = {
  items: Article[];
  now: string;
  canPublish: boolean;
  onOpen: (id: string) => void;
  onStatus: (id: string, status: ArticleStatus) => void;
};

/** A future-dated article reads "Scheduled" rather than "Published", in the badge and in its menu. */
function statusMetaFor(item: Article, now: string): Record<ArticleStatus, Meta> {
  const future = Boolean(item.published_at && Date.parse(item.published_at) > Date.parse(now));
  return { draft: ARTICLE_STATUS.draft, published: future ? ARTICLE_SCHEDULED : ARTICLE_STATUS.published };
}

function Status({ item, now, canPublish, onStatus }: { item: Article; now: string; canPublish: boolean; onStatus: Props["onStatus"] }) {
  return (
    <StatusMenu
      value={item.status}
      meta={statusMetaFor(item, now)}
      order={ARTICLE_STATUS_ORDER}
      disabled={!canPublish}
      label={`Status of ${item.title}`}
      size="sm"
      onChange={(s) => onStatus(item.id, s)}
    />
  );
}

function Cover({ item, className }: { item: Article; className?: string }) {
  const src = websiteAsset(item.cover_url);
  // A cover that can't be fetched (a website path not deployed yet, a deleted upload) shows the placeholder instead.
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface-3 text-ink-3", className)}>
      {src && failed !== src ? (
        // eslint-disable-next-line @next/next/no-img-element -- images live on the website or in Supabase Storage
        <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className="size-full object-cover" />
      ) : (
        <ImageOff aria-hidden className="size-4" />
      )}
    </span>
  );
}

function ViewLink({ item, now }: { item: Article; now: string }) {
  if (articleState(item, now) !== "published") return null;
  return (
    <Tooltip content="View on website">
      <a
        href={articleUrl(item.slug, item.published_at)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label={`View “${item.title}” on the website (opens in a new tab)`}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
      >
        <ExternalLink className="size-4" aria-hidden />
      </a>
    </Tooltip>
  );
}

/** A real table on wide screens, stacked cards on phones. */
export function ArticleTable({ items, now, canPublish, onOpen, onStatus }: Props) {
  return (
    <Card className="overflow-hidden">
      {/* ≥ md: table */}
      <div className="hidden md:block">
        <table className="w-full table-fixed text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-3">
            <tr className="border-b border-line bg-surface-2">
              <th scope="col" className="px-5 py-2 font-bold">Article</th>
              <th scope="col" className="w-36 px-3 py-2 font-bold">Category</th>
              <th scope="col" className="w-32 px-3 py-2 font-bold">Status</th>
              <th scope="col" className="w-28 px-3 py-2 font-bold">Published</th>
              <th scope="col" className="hidden w-32 px-3 py-2 font-bold xl:table-cell">Updated</th>
              <th scope="col" className="hidden w-36 px-3 py-2 font-bold xl:table-cell">Author</th>
              <th scope="col" className="w-12 py-2 pr-3"><span className="sr-only">Website link</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item) => (
              <tr key={item.id} onClick={() => onOpen(item.id)} className="cursor-pointer transition-colors hover:bg-surface-2">
                <td className="px-5 py-2.5">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(item.id); }} className="flex w-full items-center gap-3 rounded text-left">
                    <Cover item={item} className="size-10" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{item.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-ink-3">{item.excerpt || `/${item.slug}/`}</span>
                    </span>
                  </button>
                </td>
                <td className="truncate px-3 py-2.5 text-ink-2">{item.category}</td>
                <td className="px-3 py-2.5"><Status item={item} now={now} canPublish={canPublish} onStatus={onStatus} /></td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-ink-2">{item.published_at ? formatDate(item.published_at) : <span className="text-ink-3">—</span>}</td>
                <td className="hidden px-3 py-2.5 xl:table-cell">
                  <span className="tabular block whitespace-nowrap text-ink-2">{timeAgo(item.updated_at)}</span>
                  {item.editor && <span className="block truncate text-xs text-ink-3">by {item.editor.full_name}</span>}
                </td>
                <td className="hidden truncate px-3 py-2.5 text-ink-2 xl:table-cell">{item.author || <span className="text-ink-3">—</span>}</td>
                <td className="py-1.5 pr-3"><ViewLink item={item} now={now} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* < md: cards */}
      <ul className="divide-y divide-line md:hidden">
        {items.map((item) => {
          const meta = articleMeta(item, now);
          return (
            <li key={item.id} className="px-4 py-3">
              <div className="flex items-start gap-1">
                <button type="button" onClick={() => onOpen(item.id)} className="flex min-w-0 flex-1 items-start gap-3 rounded text-left">
                  <Cover item={item} className="mt-0.5 size-14" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold leading-snug text-ink">{item.title}</span>
                    {item.excerpt && <span className="mt-1 line-clamp-2 block text-xs text-ink-3">{item.excerpt}</span>}
                  </span>
                </button>
                <span className="-mr-2 -mt-1.5"><ViewLink item={item} now={now} /></span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                {canPublish ? <Status item={item} now={now} canPublish={canPublish} onStatus={onStatus} /> : <Badge tone={meta.tone} icon={meta.icon} size="sm">{meta.label}</Badge>}
                <span className="text-ink-2">{item.category}</span>
                <span className="tabular text-ink-3">{item.published_at ? formatDate(item.published_at) : "No date"}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
