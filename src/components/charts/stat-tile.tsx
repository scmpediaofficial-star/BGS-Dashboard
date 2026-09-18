import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Meter } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  value: string;
  /** Small qualifier set beside the value, e.g. "of 71". */
  unit?: string;
  caption?: string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "critical" | "good";
  meter?: { value: number; max: number; tone?: "accent" | "good" | "warning" | "critical" | "gold" };
};

const ICON_TONE = {
  default: "bg-accent-soft text-accent-ink",
  critical: "bg-critical-soft text-critical-ink",
  good: "bg-good-soft text-good-ink",
};

/** Stat tile: label · value · optional meter. Values stay in ink — the icon chip carries the tone. */
export function StatTile({ label, value, unit, caption, icon: Icon, href, tone = "default", meter }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-semibold leading-snug text-ink-2">{label}</p>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", ICON_TONE[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[28px] font-extrabold leading-none tracking-tight text-ink">{value}</span>
        {unit && <span className="text-[13px] font-semibold text-ink-3">{unit}</span>}
      </p>
      {meter && <Meter value={meter.value} max={meter.max} tone={meter.tone} size="sm" label={label} className="mt-3" />}
      {caption && <p className="mt-2 text-xs leading-snug text-ink-3">{caption}</p>}
      {href && <ArrowUpRight aria-hidden className="absolute bottom-3 right-3 size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />}
    </>
  );
  const className = "group relative block rounded-card border border-line bg-surface p-4 shadow-card transition-[box-shadow,border-color] sm:p-[18px]";
  return href ? (
    <Link href={href} className={cn(className, "hover:border-line-strong hover:shadow-raised")}>{body}</Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
