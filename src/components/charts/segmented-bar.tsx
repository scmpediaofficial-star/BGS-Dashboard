"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { cn, percent } from "@/lib/utils";

export type Segment = { key: string; label: string; value: number; color: string };

type SegmentedBarProps = { segments: Segment[]; label: string; size?: "sm" | "md"; className?: string };

/**
 * Part-to-whole bar. Segments are separated by a 2px gap in the surface colour
 * (never a stroke), ends are rounded, and every segment answers to hover and
 * keyboard focus with its own value.
 */
export function SegmentedBar({ segments, label, size = "md", className }: SegmentedBarProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const summary = visible.map((s) => `${s.label} ${s.value}`).join(", ");

  return (
    <div
      role="img"
      aria-label={`${label}: ${summary || "no items"}`}
      className={cn("flex w-full gap-0.5 overflow-hidden rounded-full", size === "sm" ? "h-2" : "h-3", !visible.length && "bg-surface-3", className)}
    >
      {visible.map((s) => (
        <Tooltip key={s.key} content={<><strong className="font-bold">{s.value}</strong> {s.label.toLowerCase()} · {percent(s.value, total)}%</>}>
          <span
            tabIndex={0}
            className="h-full min-w-1.5 rounded-[3px] outline-offset-2 transition-[filter] first:rounded-l-full last:rounded-r-full hover:brightness-110"
            style={{ flexGrow: s.value, flexBasis: 0, background: s.color }}
          />
        </Tooltip>
      ))}
    </div>
  );
}

/** Legend: swatch + label + count. Text stays in ink; the swatch carries the colour. */
export function Legend({ items, className }: { items: { label: string; color: string; value?: number }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-ink-2">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: item.color }} />
          {item.label}
          {item.value !== undefined && <span className="tabular font-semibold text-ink">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}
