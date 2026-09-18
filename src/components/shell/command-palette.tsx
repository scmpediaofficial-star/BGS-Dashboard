"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as RadixDialog } from "radix-ui";
import { CornerDownLeft, Handshake, ListChecks, LoaderCircle, Mails, MicVocal, PenSquare, Plus, Search, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NAV_ITEMS } from "@/components/shell/nav";
import { useViewer } from "@/components/shell/session-context";
import { Kbd } from "@/components/ui/misc";
import { hasRole } from "@/lib/auth/permissions";

type Hit = { id: string; label: string; sub: string; href: string; kind: "deliverable" | "panelist" | "sponsor" | "outreach" };
const KIND_ICON = { deliverable: ListChecks, panelist: MicVocal, sponsor: Handshake, outreach: Mails };

const group = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-3";
const row = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-ink data-[selected=true]:bg-surface-3 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-3";

/** ⌘K / Ctrl+K: jump anywhere, start something new, or search every tracker. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { viewer, can } = useViewer();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const requestRef = useRef(0);
  const activeHits = query.trim().length >= 2 ? hits : [];

  const changeOpen = useCallback((next: boolean) => {
    onOpenChange(next);
    if (!next) { requestRef.current += 1; setQuery(""); setHits([]); setSearching(false); }
  }, [onOpenChange]);
  const changeQuery = (value: string) => {
    setQuery(value);
    requestRef.current += 1;
    setHits([]);
    setSearching(value.trim().length >= 2);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        changeOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, changeOpen]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const request = requestRef.current;
    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      // PostgREST pattern: escape the wildcard characters people might type.
      const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      // Inside an or() tree, commas and brackets are syntax: quote the value and escape quotes/backslashes.
      const quoted = `"${like.replace(/["\\]/g, (c) => `\\${c}`)}"`;
      const [deliverables, panelists, sponsors, outreach] = await Promise.all([
        supabase.from("deliverables").select("id, title, section").ilike("title", like).limit(6),
        supabase.from("panelists").select("id, full_name, organization").or(`full_name.ilike.${quoted},organization.ilike.${quoted}`).limit(6),
        supabase.from("sponsors").select("id, organization, package").ilike("organization", like).limit(4),
        supabase.from("outreach_contacts").select("id, name, category, list").ilike("name", like).limit(6),
      ]);
      if (request !== requestRef.current) return; // a newer keystroke won
      setHits([
        ...(deliverables.data ?? []).map((d): Hit => ({ id: d.id, label: d.title, sub: d.section, href: `/deliverables?item=${d.id}`, kind: "deliverable" })),
        ...(panelists.data ?? []).map((p): Hit => ({ id: p.id, label: p.full_name, sub: p.organization ?? "Panelist", href: `/panels?item=${p.id}`, kind: "panelist" })),
        ...(sponsors.data ?? []).map((s): Hit => ({ id: s.id, label: s.organization, sub: s.package ?? "Sponsor", href: `/sponsorship?item=${s.id}`, kind: "sponsor" })),
        ...(outreach.data ?? []).map((o): Hit => ({ id: o.id, label: o.name, sub: o.category, href: `/outreach?item=${o.id}`, kind: "outreach" })),
      ]);
      setSearching(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const go = (href: string) => {
    changeOpen(false);
    router.push(href);
  };

  const pages = NAV_ITEMS.filter((item) => !item.minRole || hasRole(viewer.role, item.minRole));
  const actions = [
    can("records.write") && { label: "New deliverable", icon: Plus, href: "/deliverables?new=1" },
    can("social.draft") && { label: "Compose a social post", icon: PenSquare, href: "/social/compose" },
    can("team.manage") && { label: "Invite a team member", icon: UserPlus, href: "/team?invite=1" },
  ].filter((a): a is { label: string; icon: typeof Plus; href: string } => Boolean(a));

  return (
    <RadixDialog.Root open={open} onOpenChange={changeOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-[#0b0b23]/55 backdrop-blur-[2px] data-[state=open]:animate-overlay" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12dvh] z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-overlay outline-none data-[state=open]:animate-pop"
        >
          <RadixDialog.Title className="sr-only">Search and commands</RadixDialog.Title>
          <Command shouldFilter={activeHits.length === 0} loop label="Search and commands">
            <div className="flex items-center gap-3 border-b border-line px-4">
              {searching ? <LoaderCircle className="size-4.5 shrink-0 animate-spin text-accent" aria-hidden /> : <Search className="size-4.5 shrink-0 text-ink-3" aria-hidden />}
              <Command.Input
                value={query}
                onValueChange={changeQuery}
                placeholder="Search deliverables, panelists, sponsors… or jump to a page"
                className="h-13 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
              />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="scroll-slim max-h-[min(56dvh,420px)] overflow-y-auto p-1.5">
              <Command.Empty className="px-4 py-10 text-center text-[13px] text-ink-3">
                {searching ? "Searching…" : "Nothing matches that. Try a name, an organisation or a page."}
              </Command.Empty>

              {activeHits.length > 0 && (
                <Command.Group heading="Records" className={group}>
                  {activeHits.map((hit) => {
                    const Icon = KIND_ICON[hit.kind];
                    return (
                      <Command.Item key={`${hit.kind}-${hit.id}`} value={`${hit.kind}-${hit.id}`} onSelect={() => go(hit.href)} className={row}>
                        <Icon aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                        <span className="max-w-[40%] truncate text-xs text-ink-3">{hit.sub}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {activeHits.length === 0 && actions.length > 0 && (
                <Command.Group heading="Quick actions" className={group}>
                  {actions.map((a) => (
                    <Command.Item key={a.href} value={a.label} onSelect={() => go(a.href)} className={row}>
                      <a.icon aria-hidden />
                      {a.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {activeHits.length === 0 && (
                <Command.Group heading="Go to" className={group}>
                  {pages.map((item) => (
                    <Command.Item key={item.href} value={`${item.label} ${item.keywords ?? ""}`} onSelect={() => go(item.href)} className={row}>
                      <item.icon aria-hidden />
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <footer className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-ink-3">
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
              <span className="flex items-center gap-1.5"><Kbd><CornerDownLeft className="size-3" /></Kbd> open</span>
            </footer>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
