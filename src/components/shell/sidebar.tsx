"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, isActive, type NavBadgeKey } from "@/components/shell/nav";
import { useViewer } from "@/components/shell/session-context";
import { hasRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export type NavBadges = Record<NavBadgeKey, number>;

const BADGE_LABEL: Record<NavBadgeKey, string> = { overdue: "overdue", actions: "open", approvals: "awaiting approval" };

export function NavList({ badges, onNavigate }: { badges: NavBadges; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { viewer } = useViewer();

  return (
    <nav aria-label="Main" className="grid gap-5">
      {NAV.map((group, index) => {
        const items = group.items.filter((item) => !item.minRole || hasRole(viewer.role, item.minRole));
        if (!items.length) return null;
        return (
          <div key={group.label ?? index}>
            {group.label && <p className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-sidebar-ink-2/70">{group.label}</p>}
            <ul className="grid gap-0.5">
              {items.map((item) => {
                const active = isActive(item, pathname);
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] font-semibold transition-colors",
                        active ? "bg-[var(--sidebar-active)] text-white" : "text-sidebar-ink-2 hover:bg-[var(--sidebar-hover)] hover:text-white",
                      )}
                    >
                      {active && <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-gold" />}
                      <item.icon className={cn("size-[18px] shrink-0", active ? "text-gold" : "text-sidebar-ink-2 group-hover:text-white")} aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && item.badge && (
                        <span
                          className={cn(
                            "tabular rounded-full px-1.5 py-px text-[10.5px] font-bold",
                            item.badge === "overdue" ? "bg-critical text-white" : "bg-gold text-[#16163f]",
                          )}
                        >
                          {count > 99 ? "99+" : count}
                          <span className="sr-only"> {BADGE_LABEL[item.badge]}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({ badges, eventLine }: { badges: NavBadges; eventLine: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-hidden bg-[linear-gradient(180deg,var(--sidebar)_0%,var(--sidebar-deep)_100%)] text-sidebar-ink lg:flex">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-purple/35 blur-3xl" />
      <div className="relative px-5 pb-4 pt-5">
        <Link href="/" className="block rounded-lg" aria-label="BGS Dashboard — overview">
          <Image src="/brand/logo-white.png" alt="" width={720} height={207} priority className="h-auto w-[172px]" />
        </Link>
        <div className="mt-4 h-[3px] w-full rounded-full flag-stripe opacity-90" />
      </div>
      <div className="scroll-none relative flex-1 overflow-y-auto px-3 pb-4 pt-1">
        <NavList badges={badges} />
      </div>
      <div className="relative border-t border-[var(--sidebar-border)] px-5 py-4">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-gold">BGS 2026</p>
        <p className="mt-0.5 text-xs leading-snug text-sidebar-ink-2">{eventLine}</p>
      </div>
    </aside>
  );
}
