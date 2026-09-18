"use client";

import * as React from "react";
import { Tabs as Radix } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = Radix.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof Radix.List>) {
  return (
    <Radix.List
      className={cn("scroll-none -mb-px flex gap-5 overflow-x-auto border-b border-line", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Radix.Trigger>) {
  return (
    <Radix.Trigger
      className={cn(
        "relative flex shrink-0 items-center gap-2 whitespace-nowrap pb-2.5 pt-1 text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink",
        "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors",
        "data-[state=active]:text-ink data-[state=active]:after:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof Radix.Content>) {
  return <Radix.Content className={cn("pt-5 outline-none data-[state=active]:animate-in", className)} {...props} />;
}

type SegmentedProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }> }[];
  label: string;
  className?: string;
};

/** Compact view switcher (Table / Board / …). */
export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-[10px] bg-surface-3 p-0.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors",
              active ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            <span className={Icon ? "max-sm:sr-only" : undefined}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
