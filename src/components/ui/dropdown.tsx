"use client";

import * as React from "react";
import { DropdownMenu as Radix, Popover as RadixPopover } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const panel =
  "z-50 min-w-44 rounded-xl border border-line bg-surface p-1 shadow-overlay outline-none data-[state=open]:animate-pop";
const item =
  "flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink outline-none transition-colors data-[highlighted]:bg-surface-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-3";

export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;
export const DropdownMenuGroup = Radix.Group;

export function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }: React.ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content sideOffset={sideOffset} align={align} collisionPadding={8} className={cn(panel, className)} {...props} />
    </Radix.Portal>
  );
}

type ItemProps = React.ComponentProps<typeof Radix.Item> & { destructive?: boolean };

export function DropdownMenuItem({ className, destructive, ...props }: ItemProps) {
  return (
    <Radix.Item
      className={cn(item, destructive && "text-critical-ink data-[highlighted]:bg-critical-soft [&_svg]:text-critical-ink", className)}
      {...props}
    />
  );
}

export function DropdownMenuCheckItem({ className, checked, children, ...props }: React.ComponentProps<typeof Radix.CheckboxItem>) {
  return (
    <Radix.CheckboxItem checked={checked} className={cn(item, "pr-8", className)} {...props}>
      <span className="flex-1">{children}</span>
      <Radix.ItemIndicator className="absolute right-3">
        <Check className="!size-4 !text-accent" strokeWidth={2.6} />
      </Radix.ItemIndicator>
    </Radix.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Radix.Label>) {
  return <Radix.Label className={cn("px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-3", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Radix.Separator>) {
  return <Radix.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverClose = RadixPopover.Close;

export function PopoverContent({ className, sideOffset = 8, align = "end", ...props }: React.ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content sideOffset={sideOffset} align={align} collisionPadding={8} className={cn(panel, "p-0", className)} {...props} />
    </RadixPopover.Portal>
  );
}
