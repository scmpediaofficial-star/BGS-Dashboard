"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuCheckItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown";
import type { Meta } from "@/lib/domain";
import { cn } from "@/lib/utils";

type StatusMenuProps<T extends string> = {
  value: T;
  meta: Record<T, Meta>;
  order: T[];
  onChange: (next: T) => void;
  /** Read-only people see the badge without the menu. */
  disabled?: boolean;
  label: string;
  size?: "sm" | "md";
};

/** A status badge that doubles as its own editor — one click to move a record along. */
export function StatusMenu<T extends string>({ value, meta, order, onChange, disabled, label, size = "md" }: StatusMenuProps<T>) {
  const current = meta[value];
  if (disabled) return <Badge tone={current.tone} icon={current.icon} size={size}>{current.label}</Badge>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${current.label}. Change`}
          onClick={(e) => e.stopPropagation()}
          className="group inline-flex max-w-full items-center rounded-full outline-offset-2"
        >
          <Badge tone={current.tone} icon={current.icon} size={size} className="pr-1.5 transition-[filter] group-hover:brightness-95">
            <span className="inline-flex items-center gap-0.5">
              {current.label}
              <ChevronDown aria-hidden className={cn("opacity-60", size === "sm" ? "size-3" : "size-3.5")} />
            </span>
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {order.map((option) => {
          const item = meta[option];
          return (
            <DropdownMenuCheckItem key={option} checked={option === value} onSelect={() => option !== value && onChange(option)}>
              <span className="flex items-center gap-2.5"><item.icon aria-hidden /> {item.label}</span>
            </DropdownMenuCheckItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
