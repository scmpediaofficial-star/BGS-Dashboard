"use client";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { paystackState } from "@/lib/domain";

export function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`), () => toast.error("Copying is blocked in this browser. Select the text and copy it by hand."));
}

/** Paystack statuses always travel as icon + label, never colour alone. */
export function StateBadge({ status, size }: { status: string; size?: "sm" | "md" }) {
  const meta = paystackState(status);
  return <Badge tone={meta.tone} icon={meta.icon} size={size}>{meta.label}</Badge>;
}
