"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/dropdown";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useViewer } from "@/components/shell/session-context";
import { CATEGORIES, type Category } from "@/lib/notifications";
import { cn, timeAgo } from "@/lib/utils";
import type { Tables } from "@/types/database";

type Notification = Pick<Tables<"notifications">, "id" | "title" | "body" | "link" | "category" | "importance" | "read_at" | "created_at" | "actor_name">;
const COLUMNS = "id, title, body, link, category, importance, read_at, created_at, actor_name";

export function NotificationsBell({ initialUnread }: { initialUnread: number }) {
  const { viewer } = useViewer();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Notification[] | null>(null);
  const openRef = useRef(open);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { count }] = await Promise.all([
      supabase.from("notifications").select(COLUMNS).order("created_at", { ascending: false }).limit(25),
      supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    setItems(data ?? []);
    if (count !== null) setUnread(count);
  }, []);

  // Live: a row inserted for this person arrives over Supabase Realtime (row-level security scopes the stream).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${viewer.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${viewer.id}` }, (payload) => {
        const row = payload.new as Notification;
        setUnread((n) => n + 1);
        setItems((list) => (list ? [row, ...list].slice(0, 25) : list));
        if (!openRef.current) {
          toast(row.title, {
            description: row.body ?? undefined,
            icon: <BellRing className="size-4 text-accent" />,
            action: row.link ? { label: "Open", onClick: () => router.push(row.link!) } : undefined,
          });
        }
        router.refresh(); // pull the change the alert is about into whatever page is open
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewer.id, router]);

  // Keep the installed app's icon badge in step with the bell.
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread > 0) nav.setAppBadge?.(unread).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  async function markRead(id: string) {
    setItems((list) => list?.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)) ?? list);
    setUnread((n) => Math.max(0, n - 1));
    await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    setItems((list) => list?.map((n) => ({ ...n, read_at: n.read_at ?? now })) ?? list);
    setUnread(0);
    await createClient().from("notifications").update({ read_at: now }).is("read_at", null);
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); openRef.current = next; if (next) void load(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell />
          {unread > 0 && (
            <span className="tabular absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-[9.5px] font-bold leading-none text-white ring-2 ring-surface">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex max-h-[min(70dvh,560px)] w-[min(calc(100vw-1rem),400px)] flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold text-ink">Notifications</h2>
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={!unread}>
            <CheckCheck /> Mark all read
          </Button>
        </header>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
          {items === null ? (
            <div className="grid gap-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : items.length === 0 ? (
            <EmptyState icon={Inbox} title="You're all caught up" description="Alerts about deliverables, approvals, sales and everything else the team does will land here." className="py-10" />
          ) : (
            <ul className="divide-y divide-line">
              {items.map((n) => {
                const unreadRow = !n.read_at;
                const body = (
                  <div className={cn("flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2", unreadRow && "bg-accent-soft/40")}>
                    <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", unreadRow ? (n.importance === "high" ? "bg-critical" : "bg-accent") : "bg-transparent")} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[13px] leading-snug text-ink", unreadRow ? "font-semibold" : "font-medium")}>{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-ink-3">
                        {CATEGORIES[n.category as Category]?.label ?? "General"} · {timeAgo(n.created_at)}
                      </p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => { markRead(n.id); setOpen(false); }} className="block">{body}</Link>
                    ) : (
                      <button type="button" onClick={() => markRead(n.id)} className="block w-full text-left">{body}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="border-t border-line px-4 py-2.5 text-center">
          <Link href="/settings/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-accent-ink hover:underline">
            Notification preferences
          </Link>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
