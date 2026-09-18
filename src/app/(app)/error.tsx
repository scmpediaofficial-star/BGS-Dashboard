"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-critical-soft text-critical-ink"><TriangleAlert className="size-6" aria-hidden /></span>
      <h1 className="mt-5 text-xl font-extrabold text-ink">This page hit a problem</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">Nothing was lost. Try again — if it keeps happening, tell an administrator what you were doing.</p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-ink-3">Reference: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}><RefreshCw /> Try again</Button>
    </div>
  );
}
