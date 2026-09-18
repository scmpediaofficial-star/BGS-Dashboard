"use client";

import * as React from "react";
import { AlertDialog, Dialog as RadixDialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const overlay = "fixed inset-0 z-50 bg-[#0b0b23]/55 backdrop-blur-[2px] data-[state=open]:animate-overlay";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

type ContentProps = React.ComponentProps<typeof RadixDialog.Content> & {
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: React.ReactNode;
};

const WIDTH = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" };

/** Centered modal on desktop, bottom sheet on phones. */
export function DialogContent({ title, description, size = "md", footer, className, children, ...props }: ContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={overlay} />
      <RadixDialog.Content
        className={cn(
          "fixed z-50 flex max-h-[92dvh] w-full flex-col bg-surface shadow-overlay outline-none",
          "inset-x-0 bottom-0 rounded-t-2xl pb-safe data-[state=open]:animate-rise",
          "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-0 sm:data-[state=open]:animate-pop",
          WIDTH[size],
          className,
        )}
        {...props}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <RadixDialog.Title className="text-base font-bold text-ink">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-0.5 text-[12.5px] text-ink-3">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-1.5 -mt-0.5">
              <X />
            </Button>
          </RadixDialog.Close>
        </header>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/** Right-hand drawer for record detail; full-width on phones. */
export function SheetContent({ title, description, footer, className, children, ...props }: Omit<ContentProps, "size">) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={overlay} />
      <RadixDialog.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-overlay outline-none pt-safe pb-safe data-[state=open]:animate-sheet sm:max-w-[520px] sm:border-l sm:border-line",
          className,
        )}
        {...props}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <RadixDialog.Title className="text-base font-bold leading-snug text-ink">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-0.5 text-[12.5px] text-ink-3">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-1.5 -mt-0.5">
              <X />
            </Button>
          </RadixDialog.Close>
        </header>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", destructive, loading, onConfirm }: ConfirmProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlay} />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-5 shadow-overlay outline-none data-[state=open]:animate-pop">
          <AlertDialog.Title className="text-base font-bold text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{description}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={loading}>Cancel</Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? "danger" : "primary"}
              loading={loading}
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
