"use client";

import { useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Flag, GripVertical, ListChecks } from "lucide-react";
import { isOverdue, readChecklist, type Deliverable } from "@/components/deliverables/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DELIVERABLE_STATUS, DELIVERABLE_STATUS_ORDER, PRIORITY, type DeliverableStatus } from "@/lib/domain";
import { cn, formatDate } from "@/lib/utils";

type Props = {
  items: Deliverable[];
  today: string;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onStatus: (id: string, status: DeliverableStatus) => void;
};

function CardBody({ item, today, dragging }: { item: Deliverable; today: string; dragging?: boolean }) {
  const late = isOverdue(item, today);
  const checklist = readChecklist(item.checklist);
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-3 shadow-card", dragging && "rotate-1 border-accent shadow-overlay")}>
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">{item.section}</p>
      <p className="mt-1 text-[13px] font-semibold leading-snug text-ink">
        {item.title}{item.quantity ? <span className="font-normal text-ink-3"> × {item.quantity}</span> : null}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11.5px]">
        {(item.priority === "high" || item.priority === "critical") && <Badge tone={PRIORITY[item.priority].tone} icon={PRIORITY[item.priority].icon} size="sm">{PRIORITY[item.priority].label}</Badge>}
        {item.due_date && (
          <span className={cn("tabular flex items-center gap-1", late ? "font-semibold text-critical-ink" : "text-ink-3")}>
            {late && <Flag className="size-3" aria-hidden />}
            {formatDate(item.due_date, { year: false })}
          </span>
        )}
        {checklist.length > 0 && <span className="tabular flex items-center gap-1 text-ink-3"><ListChecks className="size-3.5" aria-hidden />{checklist.filter((c) => c.done).length}/{checklist.length}</span>}
        <span className="ml-auto flex items-center gap-1.5 text-ink-2">
          {item.responsibility && <span className="max-w-24 truncate">{item.responsibility}</span>}
          {item.assignee && <Avatar name={item.assignee.full_name} src={item.assignee.avatar_url} size="xs" />}
        </span>
      </div>
    </div>
  );
}

function DraggableCard({ item, today, canEdit, onOpen }: { item: Deliverable; today: string; canEdit: boolean; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: !canEdit });
  return (
    <li ref={setNodeRef} className={cn("group relative", isDragging && "opacity-35")}>
      {/* The whole card opens the record; the grip is the drag handle, so scrolling on touch never starts a drag by accident. */}
      <button type="button" onClick={() => onOpen(item.id)} className="block w-full rounded-xl text-left outline-offset-2">
        <CardBody item={item} today={today} />
      </button>
      {canEdit && (
        <button
          type="button"
          aria-label={`Move ${item.title}`}
          className="absolute right-1.5 top-1.5 grid size-7 cursor-grab touch-none place-items-center rounded-md text-ink-3 opacity-60 transition-opacity hover:bg-surface-3 hover:text-ink active:cursor-grabbing group-hover:opacity-100 lg:opacity-0 lg:focus-visible:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
    </li>
  );
}

function Column({ status, items, today, canEdit, onOpen }: { status: DeliverableStatus; items: Deliverable[]; today: string; canEdit: boolean; onOpen: (id: string) => void }) {
  const meta = DELIVERABLE_STATUS[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${meta.label}, ${items.length} deliverables`}
      className={cn("flex w-[82vw] max-w-[320px] shrink-0 snap-center flex-col rounded-2xl border bg-surface-2 transition-colors sm:w-[300px] xl:w-auto xl:max-w-none xl:flex-1", isOver ? "border-accent bg-accent-soft/60" : "border-line")}
    >
      <header className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3">
        <h3 className="flex items-center gap-2 text-[13px] font-bold text-ink"><meta.icon className="size-4 text-ink-3" aria-hidden />{meta.label}</h3>
        <span className="tabular rounded-full bg-surface px-2 py-px text-[11px] font-bold text-ink-2 shadow-card">{items.length}</span>
      </header>
      <ul className="scroll-slim grid max-h-[62dvh] min-h-24 content-start gap-2 overflow-y-auto px-2.5 pb-2.5">
        {items.map((item) => <DraggableCard key={item.id} item={item} today={today} canEdit={canEdit} onOpen={onOpen} />)}
        {items.length === 0 && <li className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-ink-3">{canEdit ? "Drop a card here" : "Nothing here"}</li>}
      </ul>
    </section>
  );
}

/** Kanban by status. Drag with mouse, touch (via the grip) or keyboard (focus the grip, Space, arrows, Space). */
export function DeliverableBoard({ items, today, canEdit, onOpen, onStatus }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const active = activeId ? items.find((d) => d.id === activeId) : null;

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const target = event.over?.id as DeliverableStatus | undefined;
    const item = items.find((d) => d.id === event.active.id);
    if (target && item && item.status !== target) onStatus(item.id, target);
  }

  return (
    <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="scroll-slim -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 xl:snap-none">
        {DELIVERABLE_STATUS_ORDER.map((status) => (
          <Column key={status} status={status} items={items.filter((d) => d.status === status)} today={today} canEdit={canEdit} onOpen={onOpen} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
        {active ? <div className="w-[280px]"><CardBody item={active} today={today} dragging /></div> : null}
      </DragOverlay>
    </DndContext>
  );
}
