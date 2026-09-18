"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ActivityFeed, type ActivityEntry } from "@/components/activity/activity-feed";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { FilterChip, PageHeader } from "@/components/ui/misc";
import { CATEGORIES, CATEGORY_KEYS } from "@/lib/notifications";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

export function ActivityView({ entries }: { entries: ActivityEntry[] }) {
  useRealtimeRefresh(["activity_log"]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const visible = useMemo(() => entries.filter((entry) => (category === "all" || entry.category === category) &&
    `${entry.actor_name ?? "System"} ${entry.summary}`.toLowerCase().includes(search.trim().toLowerCase())), [entries, category, search]);
  return <><PageHeader eyebrow="Workspace" title="Activity" description="A live record of changes, decisions and publishing across the summit." />
    <div className="mb-3 relative max-w-lg"><Search aria-hidden className="absolute left-3 top-2.5 size-4 text-ink-3" /><Input className="pl-9" aria-label="Search activity" placeholder="Search activity…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    <div className="scroll-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"><FilterChip active={category === "all"} count={entries.length} onClick={() => setCategory("all")}>All</FilterChip>{CATEGORY_KEYS.map((key) => <FilterChip key={key} active={category === key} count={entries.filter((e) => e.category === key).length} onClick={() => setCategory(key)}>{CATEGORIES[key].label}</FilterChip>)}</div>
    <Card className="px-5 py-3"><ActivityFeed entries={visible} /></Card>
  </>;
}
