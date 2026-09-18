import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <span className="mb-3.5 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-ink">
        <Icon className="size-5.5" aria-hidden />
      </span>
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-ink">{eyebrow}</p>}
        <h1 className="text-[22px] font-extrabold leading-tight text-ink sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type MeterProps = {
  value: number;
  max: number;
  label: string;
  tone?: "accent" | "good" | "warning" | "critical" | "gold";
  size?: "sm" | "md";
  className?: string;
};

// The unfilled track is a lighter step of the fill's own ramp, so state reads across the whole bar.
const METER = {
  accent: ["bg-accent", "bg-accent-soft"],
  good: ["bg-good", "bg-good-soft"],
  warning: ["bg-warning", "bg-warning-soft"],
  critical: ["bg-critical", "bg-critical-soft"],
  gold: ["bg-gold", "bg-gold-soft"],
} as const;

export function Meter({ value, max, label, tone = "accent", size = "md", className }: MeterProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const [fill, track] = METER[tone];
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("w-full overflow-hidden rounded-full", track, size === "sm" ? "h-1.5" : "h-2.5", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-md border border-line-strong bg-surface-2 px-1 font-sans text-[10.5px] font-semibold text-ink-3">
      {children}
    </kbd>
  );
}

/** Horizontal filter row that scrolls on phones instead of wrapping into a wall. */
export function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between", className)} {...props} />;
}

type ChipProps = React.ComponentProps<"button"> & { active?: boolean; count?: number };

export function FilterChip({ active, count, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-fg dark:border-accent dark:bg-accent dark:text-accent-fg"
          : "border-line-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span className={cn("tabular rounded-full px-1.5 text-[10.5px]", active ? "bg-white/20" : "bg-surface-3 text-ink-3")}>{count}</span>
      )}
    </button>
  );
}
