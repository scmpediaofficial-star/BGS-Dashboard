"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";
import { NAV_START } from "@/lib/hooks/use-nav-router";
import { cn } from "@/lib/utils";

/**
 * Instant feedback for every navigation: a thin bar across the top of the
 * window (and a "busy" cursor) from the moment a link is pressed until the new
 * page has arrived. Links, the back button and anything sent through useNavRouter() trigger it.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const here = `${pathname}?${search}`;
  // Remember which page the navigation started from: once the address changes, it is over.
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const active = startedAt === here;
  const hereRef = useRef(here);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    hereRef.current = here;
  }, [here]);

  useEffect(() => {
    const start = () => {
      setStartedAt(hereRef.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStartedAt(null), 15000); // never stick
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);
    window.addEventListener(NAV_START, start);
    return () => {
      window.removeEventListener(NAV_START, start);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
    };
  }, []);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-navigating", active);
  }, [active]);

  return (
    <div aria-hidden className={cn("nav-progress", active && "is-active")}>
      <span />
    </div>
  );
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}

/** Put inside a <Link>: a small spinner while that link's page is on its way. */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <LoaderCircle aria-hidden className={cn("size-3.5 shrink-0 animate-spin opacity-80", className)} />;
}
