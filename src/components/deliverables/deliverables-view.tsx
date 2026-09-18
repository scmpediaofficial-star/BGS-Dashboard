"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, KanbanSquare, ListFilter, Plus, Search, Table2, UserRound, X } from "lucide-react";
import { setDeliverableStatus } from "@/app/(app)/deliverables/actions";
import { SegmentedBar } from "@/components/charts/segmented-bar";
import { DeliverableBoard } from "@/components/deliverables/deliverable-board";
import { DeliverableSheet } from "@/components/deliverables/deliverable-sheet";
import { DeliverableTable } from "@/components/deliverables/deliverable-table";
import { isOverdue, type Deliverable, type Person, type Workstream } from "@/components/deliverables/types";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuCheckItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/form";
import { EmptyState, FilterChip, PageHeader } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/tabs";
import { DELIVERABLE_PROGRESS_ORDER, DELIVERABLE_STATUS, DELIVERABLE_STATUS_ORDER, PRIORITY, type DeliverableStatus } from "@/lib/domain";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { daysUntil, percent, toCsv } from "@/lib/utils";

type DueFilter = "all" | "overdue" | "week" | "none";
const DUE_LABEL: Record<DueFilter, string> = { all: "Any date", overdue: "Overdue", week: "Due in 7 days", none: "No date" };

type Props = { workstreams: Workstream[]; deliverables: Deliverable[]; people: Person[]; organizations: string[]; today: string };

export function DeliverablesView({ workstreams, deliverables, people, organizations, today }: Props) {
  const { viewer, can } = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useRealtimeRefresh(["deliverables"]);

  // ── State that lives in the URL, so filtered views and open records are shareable links ──
  const ws = params.get("ws") ?? "all";
  const due = (params.get("due") as DueFilter) ?? "all";
  const view = params.get("view") === "board" ? "board" : "table";
  const openId = params.get("item");
  const creating = params.get("new") === "1";

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Set<DeliverableStatus>>(new Set());
  const [owner, setOwner] = useState("all");
  const [mine, setMine] = useState(false);

  // Optimistic status: the badge moves instantly, the server confirms (or the refresh reverts it).
  const [optimistic, setOptimistic] = useState<{ source: Deliverable[]; values: Record<string, DeliverableStatus> }>({ source: deliverables, values: {} });
  const [changeStatus] = useAction(setDeliverableStatus, { silent: true });
  const onStatus = useCallback(
    async (id: string, status: DeliverableStatus) => {
      setOptimistic((current) => ({ source: deliverables, values: { ...(current.source === deliverables ? current.values : {}), [id]: status } }));
      const result = await changeStatus(id, status);
      if (!result.ok) setOptimistic((current) => ({ source: current.source, values: Object.fromEntries(Object.entries(current.values).filter(([key]) => key !== id)) }));
    },
    [changeStatus, deliverables],
  );

  const items = useMemo(() => {
    const overrides = optimistic.source === deliverables ? optimistic.values : {};
    return deliverables.map((d) => (overrides[d.id] ? { ...d, status: overrides[d.id] } : d));
  }, [deliverables, optimistic]);
  const owners = useMemo(() => [...new Set(items.map((d) => d.responsibility?.trim()).filter((o): o is string => Boolean(o)))].sort(), [items]);
  const activeWs = workstreams.find((w) => w.slug === ws);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((d) => {
      if (activeWs && d.workstream_id !== activeWs.id) return false;
      if (statuses.size && !statuses.has(d.status)) return false;
      if (owner !== "all" && (d.responsibility?.trim() ?? "") !== owner) return false;
      if (mine && d.assignee_id !== viewer.id) return false;
      if (due === "overdue" && !isOverdue(d, today)) return false;
      if (due === "none" && d.due_date) return false;
      if (due === "week") {
        const days = daysUntil(d.due_date, today);
        if (d.status === "completed" || days === null || days < 0 || days > 7) return false;
      }
      if (term && ![d.title, d.section, d.comment, d.responsibility, d.assignee?.full_name].some((v) => v?.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [items, activeWs, statuses, owner, mine, due, query, today, viewer.id]);

  const filterCount = statuses.size + (owner !== "all" ? 1 : 0) + (mine ? 1 : 0) + (due !== "all" ? 1 : 0);
  const clearFilters = () => { setStatuses(new Set()); setOwner("all"); setMine(false); setQuery(""); setParams({ due: null }); };

  const scope = activeWs ? items.filter((d) => d.workstream_id === activeWs.id) : items;
  const done = scope.filter((d) => d.status === "completed").length;
  const late = scope.filter((d) => isOverdue(d, today)).length;

  function exportCsv() {
    const rows = filtered.map((d) => [
      workstreams.find((w) => w.id === d.workstream_id)?.name ?? "", d.section, d.title, d.quantity, d.responsibility, d.assignee?.full_name,
      DELIVERABLE_STATUS[d.status].label, PRIORITY[d.priority].label, d.due_date, d.comment,
    ]);
    const csv = toCsv([["Workstream", "Section", "Deliverable", "Quantity", "Responsibility", "Assignee", "Status", "Priority", "Due", "Comment"], ...rows]);
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `bgs-deliverables-${today}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const selected = openId ? items.find((d) => d.id === openId) ?? null : null;

  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title="Deliverables"
        description="Every creative, production, PR and client item for the summit — who owns it, where it stands and when it's due."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><Download /> Export</Button>
            {can("records.write") && <Button onClick={() => setParams({ new: "1", item: null })}><Plus /> New deliverable</Button>}
          </>
        }
      />

      {/* Scope summary */}
      <Card className="mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-xs font-semibold text-ink-3">{activeWs ? activeWs.name : "All workstreams"}</p>
            <p className="mt-0.5 text-[13px] text-ink-2">
              <strong className="text-xl font-extrabold text-ink">{percent(done, scope.length)}%</strong> complete · <span className="tabular">{done} of {scope.length}</span> done
              {late > 0 && <> · <button type="button" onClick={() => setParams({ due: "overdue" })} className="font-semibold text-critical-ink underline-offset-2 hover:underline">{late} overdue</button></>}
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {DELIVERABLE_PROGRESS_ORDER.map((s) => {
              const meta = DELIVERABLE_STATUS[s];
              return (
                <li key={s} className="flex items-center gap-1.5 text-xs text-ink-2">
                  <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: meta.color }} />
                  {meta.label} <span className="tabular font-semibold text-ink">{scope.filter((d) => d.status === s).length}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <SegmentedBar
          className="mt-3"
          label={activeWs ? activeWs.name : "All deliverables"}
          segments={DELIVERABLE_PROGRESS_ORDER.map((s) => ({ key: s, label: DELIVERABLE_STATUS[s].label, value: scope.filter((d) => d.status === s).length, color: DELIVERABLE_STATUS[s].color }))}
        />
      </Card>

      {/* One filter row above everything it scopes */}
      <div className="mb-4 grid gap-2.5">
        <div className="scroll-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <FilterChip active={ws === "all"} count={items.length} onClick={() => setParams({ ws: null })}>All</FilterChip>
          {workstreams.map((w) => (
            <FilterChip key={w.id} active={ws === w.slug} count={items.filter((d) => d.workstream_id === w.id).length} onClick={() => setParams({ ws: w.slug })}>{w.name}</FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deliverables…" aria-label="Search deliverables" className="pl-9" />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <ListFilter /> Filters
                {filterCount > 0 && <span className="tabular grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent px-1 text-[10.5px] text-accent-fg">{filterCount}</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="scroll-slim max-h-[70dvh] w-60 overflow-y-auto">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {DELIVERABLE_STATUS_ORDER.map((s) => (
                <DropdownMenuCheckItem key={s} checked={statuses.has(s)} onSelect={(e) => { e.preventDefault(); setStatuses((prev) => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; }); }}>
                  {DELIVERABLE_STATUS[s].label}
                </DropdownMenuCheckItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Due</DropdownMenuLabel>
              {(Object.keys(DUE_LABEL) as DueFilter[]).map((d) => (
                <DropdownMenuCheckItem key={d} checked={due === d} onSelect={(e) => { e.preventDefault(); setParams({ due: d }); }}>{DUE_LABEL[d]}</DropdownMenuCheckItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Responsible</DropdownMenuLabel>
              <DropdownMenuCheckItem checked={owner === "all"} onSelect={(e) => { e.preventDefault(); setOwner("all"); }}>Everyone</DropdownMenuCheckItem>
              {owners.map((o) => (
                <DropdownMenuCheckItem key={o} checked={owner === o} onSelect={(e) => { e.preventDefault(); setOwner(o); }}>{o}</DropdownMenuCheckItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <FilterChip active={mine} onClick={() => setMine((m) => !m)} className="h-9.5 rounded-[10px]"><UserRound className="size-3.5" /> Mine</FilterChip>
          {(filterCount > 0 || query) && <Button variant="ghost" size="sm" onClick={clearFilters}><X /> Clear</Button>}

          <Segmented
            className="ml-auto"
            label="View"
            value={view}
            onChange={(v) => setParams({ view: v === "board" ? "board" : null })}
            options={[{ value: "table", label: "Table", icon: Table2 }, { value: "board", label: "Board", icon: KanbanSquare }]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListFilter}
            title={items.length ? "No deliverables match" : "No deliverables yet"}
            description={items.length ? "Try a different workstream, or clear the filters." : "Add the first deliverable to start tracking the summit."}
            action={items.length ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        </Card>
      ) : view === "board" ? (
        <DeliverableBoard items={filtered} today={today} canEdit={can("records.write")} onOpen={(id) => setParams({ item: id })} onStatus={onStatus} />
      ) : (
        <DeliverableTable items={filtered} workstreams={activeWs ? [activeWs] : workstreams} today={today} canEdit={can("records.write")} onOpen={(id) => setParams({ item: id })} onStatus={onStatus} />
      )}

      <p className="mt-3 text-xs text-ink-3">Showing {filtered.length} of {items.length} deliverables</p>

      <DeliverableSheet
        key={selected?.id ?? (creating ? "new" : "closed")}
        open={Boolean(selected) || creating}
        deliverable={selected}
        defaultWorkstreamId={activeWs?.id ?? workstreams[0]?.id ?? ""}
        workstreams={workstreams}
        people={people}
        organizations={[...new Set([...organizations, ...owners])]}
        sections={[...new Set(items.map((d) => d.section))].sort()}
        today={today}
        onClose={() => setParams({ item: null, new: null })}
      />
    </>
  );
}
