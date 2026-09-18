"use client";

import * as React from "react";
import { Tooltip as Radix } from "radix-ui";

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
};

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  if (!content) return <>{children}</>;
  return (
    <Radix.Root>
      <Radix.Trigger asChild>{children}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[60] max-w-64 rounded-lg bg-[#16163f] px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-overlay data-[state=delayed-open]:animate-pop dark:bg-surface-3"
        >
          {content}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
