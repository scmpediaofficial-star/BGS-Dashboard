"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

/** Fired just before a navigation that needs the server, so the progress bar can start at once. */
export const NAV_START = "bgs:nav-start";

/**
 * Pages whose server component reads the query string (tabs or filters that
 * load different data). Everywhere else, `?item=`, `?new=`, `?tab=` and filters
 * only change what the already-loaded page shows.
 */
const SERVER_READS_QUERY = ["/sms", "/settings", "/social/accounts", "/social/compose", "/payments", "/institutions"];

function serverReadsQuery(pathname: string) {
  return pathname === "/" || SERVER_READS_QUERY.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * `useRouter()` with instant feedback:
 * - changing the query on the same page (opening a record's sheet, switching a
 *   tab, filtering) updates the address straight away, with no trip to the
 *   server, so the sheet opens the moment it is clicked;
 * - anything that does need the server announces itself first, which starts
 *   the progress bar.
 */
export function useNavRouter() {
  const router = useRouter();
  return useMemo(() => {
    const go = (kind: "push" | "replace", href: string, options?: Parameters<typeof router.push>[1]) => {
      const url = new URL(href, window.location.href);
      const samePage = url.origin === window.location.origin && url.pathname === window.location.pathname;
      if (samePage && !serverReadsQuery(url.pathname)) {
        const target = `${url.pathname}${url.search}${url.hash}`;
        if (kind === "push") window.history.pushState(null, "", target);
        else window.history.replaceState(null, "", target);
        return;
      }
      if (!(samePage && url.search === window.location.search)) window.dispatchEvent(new Event(NAV_START));
      router[kind](href, options);
    };
    return {
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) => go("push", href, options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => go("replace", href, options),
    };
  }, [router]);
}
