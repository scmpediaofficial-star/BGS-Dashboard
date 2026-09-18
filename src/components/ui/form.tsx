"use client";

import * as React from "react";
import { Checkbox as RadixCheckbox, Switch as RadixSwitch } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] text-ink shadow-card transition-[border-color,box-shadow] placeholder:text-ink-3 hover:border-ink-3/60 focus:border-accent focus:outline-none focus:ring-3 focus:ring-ring/20 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70 aria-[invalid=true]:border-critical aria-[invalid=true]:ring-critical/15";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-9.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 resize-y py-2.5 leading-relaxed", className)} {...props} />;
}

/** Native select: the most reliable control on phones, styled to match. */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className="relative block w-full">
      <select className={cn(control, "h-9.5 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
    </span>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[12.5px] font-semibold text-ink-2", className)} {...props} />;
}

type FieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Field({ label, htmlFor, hint, error, optional, className, children }: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional && <span className="text-[11px] text-ink-3">Optional</span>}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-critical-ink">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof RadixCheckbox.Root>) {
  return (
    <RadixCheckbox.Root
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-[6px] border border-line-strong bg-surface shadow-card transition-colors hover:border-accent data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator>
        <Check className="size-3.5" strokeWidth={3} />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      className={cn(
        "relative h-[22px] w-10 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-white shadow-raised transition-transform data-[state=checked]:translate-x-5" />
    </RadixSwitch.Root>
  );
}
