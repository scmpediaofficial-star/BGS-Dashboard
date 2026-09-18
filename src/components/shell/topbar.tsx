"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Check, LogOut, Menu, Monitor, Moon, Search, Settings, Sun, UserRound } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import { signOut } from "@/app/(auth)/actions";
import { CommandPalette } from "@/components/shell/command-palette";
import { NotificationsBell } from "@/components/shell/notifications-bell";
import { NavList, type NavBadges } from "@/components/shell/sidebar";
import { useViewer } from "@/components/shell/session-context";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Kbd } from "@/components/ui/misc";
import { ROLE_META } from "@/lib/auth/permissions";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match device", icon: Monitor },
] as const;

type TopbarProps = { badges: NavBadges; unread: number; daysToGo: number | null; eventLine: string };

export function Topbar({ badges, unread, daysToGo, eventLine }: TopbarProps) {
  const { viewer } = useViewer();
  const { theme, setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/85 pt-safe backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:h-16 lg:px-8">
        {/* Phone & tablet: menu drawer */}
        <RadixDialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <RadixDialog.Trigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu"><Menu /></Button>
          </RadixDialog.Trigger>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 z-50 bg-[#0b0b23]/55 backdrop-blur-[2px] data-[state=open]:animate-overlay lg:hidden" />
            <RadixDialog.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-xs flex-col bg-[linear-gradient(180deg,var(--sidebar)_0%,var(--sidebar-deep)_100%)] pt-safe pb-safe text-white shadow-overlay outline-none data-[state=open]:animate-drawer lg:hidden"
            >
              <RadixDialog.Title className="sr-only">Menu</RadixDialog.Title>
              <div className="px-5 pb-4 pt-5">
                <Image src="/brand/logo-white.png" alt="BGS — The Boardroom Governance Summit" width={720} height={207} className="h-auto w-40" />
                <div className="mt-4 h-[3px] rounded-full flag-stripe" />
              </div>
              <div className="scroll-none flex-1 overflow-y-auto px-3 pb-4">
                <NavList badges={badges} onNavigate={() => setDrawerOpen(false)} />
              </div>
              <p className="border-t border-white/10 px-5 py-4 text-xs text-sidebar-ink-2">{eventLine}</p>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>

        <Link href="/" className="lg:hidden" aria-label="BGS Dashboard — overview">
          <Image src="/brand/logo-color.png" alt="" width={720} height={211} className="h-7 w-auto dark:hidden" />
          <Image src="/brand/logo-white.png" alt="" width={720} height={207} className="hidden h-7 w-auto dark:block" />
        </Link>

        {/* Search trigger */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="ml-auto hidden h-9.5 w-full max-w-sm items-center gap-2.5 rounded-[10px] border border-line-strong bg-surface-2 px-3 text-[13px] text-ink-3 transition-colors hover:border-ink-3/60 hover:text-ink-2 md:flex lg:ml-0"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search or jump to…</span>
          <span className="flex gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </button>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5">
          {daysToGo !== null && daysToGo >= 0 && (
            <Badge tone="gold" className="mr-1 hidden sm:inline-flex">
              {daysToGo === 0 ? "Summit day" : `${daysToGo} ${daysToGo === 1 ? "day" : "days"} to go`}
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}><Search /></Button>
          <NotificationsBell initialUnread={unread} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ml-1 rounded-full" aria-label="Your account">
                <Avatar name={viewer.name} src={viewer.avatarUrl} size="md" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <div className="flex items-center gap-3 px-2.5 py-2.5">
                <Avatar name={viewer.name} src={viewer.avatarUrl} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-ink">{viewer.name}</p>
                  <p className="truncate text-xs text-ink-3">{viewer.email}</p>
                </div>
              </div>
              <div className="px-2.5 pb-2"><Badge tone="accent">{ROLE_META[viewer.role].label}</Badge></div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/settings"><UserRound /> Your profile</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/settings/notifications"><Settings /> Notification preferences</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Appearance</DropdownMenuLabel>
              {THEMES.map((t) => (
                <DropdownMenuItem key={t.value} onSelect={(e) => { e.preventDefault(); setTheme(t.value); }}>
                  <t.icon /> <span className="flex-1">{t.label}</span>
                  {theme === t.value && <Check className="!text-accent" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => signOut()}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
