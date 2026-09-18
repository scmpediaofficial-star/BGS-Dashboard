import Link from "next/link";
import { History } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { CATEGORIES, type Category } from "@/lib/notifications";
import { timeAgo } from "@/lib/utils";

export type ActivityEntry = { id: number; actor_name: string | null; summary: string; link: string | null; category: string; created_at: string };

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (!entries.length) {
    return <EmptyState icon={History} title="No activity yet" description="As the team updates trackers, approves posts and records sales, the trail builds here." className="py-8" />;
  }
  return (
    <ol className="divide-y divide-line">
      {entries.map((entry) => {
        const actor = entry.actor_name ?? "System";
        const row = (
          <>
            <Avatar name={actor} size="sm" />
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">
              <strong className="font-semibold text-ink">{actor}</strong> {entry.summary}
              <span className="mt-0.5 block text-[11px] text-ink-3">
                {CATEGORIES[entry.category as Category]?.label ?? "General"} · <time dateTime={entry.created_at}>{timeAgo(entry.created_at)}</time>
              </span>
            </p>
          </>
        );
        return (
          <li key={entry.id}>
            {entry.link ? (
              <Link href={entry.link} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2">{row}</Link>
            ) : (
              <div className="flex items-start gap-3 py-2.5">{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
