"use client";

import { Flag, ListChecks, MessageSquareText } from "lucide-react";
import { isOverdue, readChecklist, type Deliverable, type Workstream } from "@/components/deliverables/types";
import { StatusMenu } from "@/components/shared/status-menu";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { DELIVERABLE_STATUS, DELIVERABLE_STATUS_ORDER, PRIORITY, chartSlot, type DeliverableStatus } from "@/lib/domain";
import { cn, daysUntil, formatDate } from "@/lib/utils";

type Props = {
  items: Deliverable[];
  workstreams: Workstream[];
  today: string;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onStatus: (id: string, status: DeliverableStatus) => void;
};

function DueCell({ item, today }: { item: Deliverable; today: string }) {
  if (!item.due_date) return <span className="text-ink-3">—</span>;
  const late = isOverdue(item, today);
  const days = daysUntil(item.due_date, today);
  return (
    <span className={cn("tabular whitespace-nowrap", late ? "font-semibold text-critical-ink" : "text-ink-2")}>
      {late && <Flag aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />}
      {formatDate(item.due_date, { year: false })}
      {late ? <span className="ml-1 font-normal">· {-days!}d late</span> : item.status !== "completed" && days !== null && days <= 7 ? <span className="ml-1 text-ink-3">· {days === 0 ? "today" : `${days}d`}</span> : null}
    </span>
  );
}

/** Grouped by workstream → section. A real table on wide screens, stacked cards on phones. */
export function DeliverableTable({ items, workstreams, today, canEdit, onOpen, onStatus }: Props) {
  return (
    <div className="grid gap-5">
      {workstreams.map((ws) => {
        const mine = items.filter((d) => d.workstream_id === ws.id);
        if (!mine.length) return null;
        const sections = [...new Set(mine.map((d) => d.section))];
        return (
          <Card key={ws.id} className="overflow-hidden">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <h2 className="flex min-w-0 items-center gap-2.5 text-[15px] font-bold text-ink">
                <span aria-hidden className="h-4 w-1 shrink-0 rounded-full" style={{ background: chartSlot(ws.color_slot) }} />
                <span className="truncate">{ws.name}</span>
              </h2>
              <p className="tabular shrink-0 text-xs text-ink-3">
                <strong className="text-ink">{mine.filter((d) => d.status === "completed").length}</strong>/{mine.length} done
              </p>
            </header>

            {/* ≥ md: table */}
            <div className="hidden md:block">
              <table className="w-full table-fixed text-left text-[13px]">
                <colgroup>
                  <col />
                  <col className="w-16" />
                  <col className="w-44" />
                  <col className="w-40" />
                  <col className="w-40" />
                </colgroup>
                <thead className="text-[11px] uppercase tracking-wide text-ink-3">
                  <tr className="border-b border-line bg-surface-2">
                    <th scope="col" className="px-5 py-2 font-bold">Deliverable</th>
                    <th scope="col" className="px-2 py-2 text-right font-bold">Qty</th>
                    <th scope="col" className="px-3 py-2 font-bold">Responsible</th>
                    <th scope="col" className="px-3 py-2 font-bold">Status</th>
                    <th scope="col" className="px-3 py-2 pr-5 font-bold">Due</th>
                  </tr>
                </thead>
                {sections.map((section) => (
                  <tbody key={section} className="divide-y divide-line border-b border-line last:border-b-0">
                    <tr>
                      <th scope="colgroup" colSpan={5} className="bg-surface px-5 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-accent-ink">{section}</th>
                    </tr>
                    {mine.filter((d) => d.section === section).map((item) => {
                      const checklist = readChecklist(item.checklist);
                      return (
                        <tr key={item.id} onClick={() => onOpen(item.id)} className="cursor-pointer transition-colors hover:bg-surface-2">
                          <td className="px-5 py-2.5">
                            <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(item.id); }} className="block w-full rounded text-left">
                              <span className={cn("flex items-center gap-2 font-semibold text-ink", item.status === "completed" && "text-ink-3 line-through decoration-ink-3/50")}>
                                <span className="truncate">{item.title}</span>
                                {(item.priority === "high" || item.priority === "critical") && item.status !== "completed" && (
                                  <Badge tone={PRIORITY[item.priority].tone} size="sm" icon={PRIORITY[item.priority].icon}>{PRIORITY[item.priority].label}</Badge>
                                )}
                                {checklist.length > 0 && (
                                  <span className="tabular flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-3"><ListChecks className="size-3.5" aria-hidden />{checklist.filter((c) => c.done).length}/{checklist.length}</span>
                                )}
                              </span>
                              {item.comment && <span className="mt-0.5 block truncate text-xs font-normal text-ink-3">{item.comment}</span>}
                            </button>
                          </td>
                          <td className="tabular px-2 py-2.5 text-right text-ink-2">{item.quantity ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-2">
                              {item.assignee && <Tooltip content={`Assigned to ${item.assignee.full_name}`}><span><Avatar name={item.assignee.full_name} src={item.assignee.avatar_url} size="xs" /></span></Tooltip>}
                              <span className="truncate text-ink-2">{item.responsibility || (item.assignee ? item.assignee.full_name : "—")}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusMenu value={item.status} meta={DELIVERABLE_STATUS} order={DELIVERABLE_STATUS_ORDER} disabled={!canEdit} label={`Status of ${item.title}`} onChange={(s) => onStatus(item.id, s)} />
                          </td>
                          <td className="px-3 py-2.5 pr-5"><DueCell item={item} today={today} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>

            {/* < md: cards */}
            <div className="md:hidden">
              {sections.map((section) => (
                <section key={section}>
                  <h3 className="bg-surface-2 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-accent-ink">{section}</h3>
                  <ul className="divide-y divide-line">
                    {mine.filter((d) => d.section === section).map((item) => (
                      <li key={item.id} className="px-4 py-3">
                        <button type="button" onClick={() => onOpen(item.id)} className="block w-full rounded text-left">
                          <span className={cn("block text-[13.5px] font-semibold leading-snug text-ink", item.status === "completed" && "text-ink-3 line-through decoration-ink-3/50")}>
                            {item.title}{item.quantity ? <span className="font-normal text-ink-3"> × {item.quantity}</span> : null}
                          </span>
                          {item.comment && (
                            <span className="mt-1 flex items-start gap-1.5 text-xs text-ink-3"><MessageSquareText className="mt-px size-3.5 shrink-0" aria-hidden /><span className="line-clamp-2">{item.comment}</span></span>
                          )}
                        </button>
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                          <StatusMenu value={item.status} meta={DELIVERABLE_STATUS} order={DELIVERABLE_STATUS_ORDER} disabled={!canEdit} label={`Status of ${item.title}`} onChange={(s) => onStatus(item.id, s)} />
                          <span className="text-ink-2">{item.responsibility || item.assignee?.full_name || "Unassigned"}</span>
                          <span className="ml-auto"><DueCell item={item} today={today} /></span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
