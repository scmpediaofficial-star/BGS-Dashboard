"use client";

import { useOffline } from "next/offline";
import { WifiOff } from "lucide-react";

/**
 * Next.js keeps navigations and Server Actions pending while the connection is
 * down and replays them when it returns (experimental.useOffline). This banner
 * tells people that is happening, so a slow save never looks like a lost one.
 */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-center text-xs font-semibold text-[#3d2a00]">
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      You&apos;re offline. Anything you save will be sent automatically when the connection returns.
    </div>
  );
}
