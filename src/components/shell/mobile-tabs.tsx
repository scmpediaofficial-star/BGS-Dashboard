"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { MOBILE_TABS, NAV_ITEMS, isActive, type NavItem } from "@/components/shell/nav";
import { useViewer } from "@/components/shell/session-context";
import type { NavBadges } from "@/components/shell/sidebar";
import { cn } from "@/lib/utils";

const SHORT: Record<string, string> = { "/": "Overview", "/deliverables": "Tasks", "/social": "Social", "/meetings": "Actions" };

/** Thumb-reach navigation for phones, with a raised compose button in the centre. */
export function MobileTabs({ badges }: { badges: NavBadges }) {
  const pathname = usePathname();
  const { can } = useViewer();
  const tabs = MOBILE_TABS.map((href) => NAV_ITEMS.find((i) => i.href === href)!);
  const showCompose = can("social.draft");
  const cells: (NavItem | "compose")[] = showCompose ? [tabs[0], tabs[1], "compose", tabs[2], tabs[3]] : tabs;

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/92 pb-safe backdrop-blur-xl lg:hidden">
      <ul className={cn("mx-auto grid h-[58px] max-w-lg items-stretch", showCompose ? "grid-cols-5" : "grid-cols-4")}>
        {cells.map((cell) => {
          if (cell === "compose") {
            return (
              <li key="compose" className="flex items-center justify-center">
                <Link
                  href="/social/compose"
                  aria-label="Compose a social post"
                  className="grid size-12 -translate-y-3 place-items-center rounded-2xl bg-primary text-primary-fg shadow-raised ring-4 ring-bg transition-transform active:scale-95"
                >
                  <Plus className="size-6" strokeWidth={2.4} />
                </Link>
              </li>
            );
          }
          const active = isActive(cell, pathname);
          const count = cell.badge ? badges[cell.badge] : 0;
          return (
            <li key={cell.href} className="flex">
              <Link
                href={cell.href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold", active ? "text-accent-ink" : "text-ink-3")}
              >
                {active && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-b-full bg-accent" />}
                <span className="relative">
                  <cell.icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden />
                  {count > 0 && (
                    <span className={cn("tabular absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-surface", cell.badge === "overdue" ? "bg-critical" : "bg-accent")}>
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </span>
                {SHORT[cell.href] ?? cell.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
