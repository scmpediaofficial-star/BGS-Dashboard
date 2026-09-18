"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps a server-rendered page live: when anyone changes one of `tables`, the
 * route's data is re-fetched (debounced) so every open screen converges without
 * a manual reload. Row-level security still decides what the stream may carry.
 */
export function useRealtimeRefresh(tables: string[], debounceMs = 600) {
  const router = useRouter();
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, debounceMs);
    };

    let channel = supabase.channel(`live:${key}`);
    for (const table of key.split(",")) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe();

    // Catch up on anything missed while the tab was in the background.
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [key, debounceMs, router]);
}
