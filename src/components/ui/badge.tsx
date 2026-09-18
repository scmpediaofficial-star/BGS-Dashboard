import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "good" | "warning" | "serious" | "critical" | "gold" | "navy";

const TONES: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-neutral-ink",
  accent: "bg-accent-soft text-accent-ink",
  good: "bg-good-soft text-good-ink",
  warning: "bg-warning-soft text-warning-ink",
  serious: "bg-serious-soft text-serious-ink",
  critical: "bg-critical-soft text-critical-ink",
  gold: "bg-gold-soft text-gold-ink",
  navy: "bg-navy text-white dark:bg-surface-3 dark:text-ink",
};

type BadgeProps = React.ComponentProps<"span"> & { tone?: Tone; icon?: LucideIcon; size?: "sm" | "md" };

/** Status never travels as colour alone: pass an icon with every stateful badge. */
export function Badge({ tone = "neutral", icon: Icon, size = "md", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full font-semibold",
        size === "sm" ? "px-2 py-px text-[10.5px]" : "px-2.5 py-0.5 text-[11.5px]",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.4} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Dot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  const color: Record<Tone, string> = {
    neutral: "bg-neutral", accent: "bg-accent", good: "bg-good", warning: "bg-warning",
    serious: "bg-serious", critical: "bg-critical", gold: "bg-gold", navy: "bg-navy",
  };
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", color[tone], className)} />;
}
