"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { continueCampaign } from "@/app/(app)/sms/actions";
import type { Progress } from "@/components/sms/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Meter } from "@/components/ui/misc";
import { formatNumber, pluralize } from "@/lib/utils";

/**
 * Drives a blast to the end: the server sends in ~40-second rounds, and this
 * keeps asking for the next one until nothing is queued, showing the count
 * climb. Closing the tab only pauses it — the blast can be resumed from History.
 */
export function useBlastDriver() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const drive = useCallback(async (first: Progress, onDone?: (p: Progress) => void) => {
    stop.current = false;
    setRunning(true);
    let p = first;
    setProgress(p);
    while (p.status === "sending" && p.queued > 0 && !stop.current) {
      let result: Awaited<ReturnType<typeof continueCampaign>>;
      try { result = await continueCampaign(p.id); }
      catch { result = { ok: false, error: "We couldn't reach the server. The blast is paused; resume it from History." }; }
      if (!result.ok) { toast.error(result.error); break; }
      p = result.data;
      setProgress(p);
    }
    setRunning(false);
    router.refresh();
    if (p.status !== "sending") {
      if (p.failed === 0) toast.success(`Sent to ${pluralize(p.sent, "person", "people")}`);
      else toast.warning(`Sent to ${formatNumber(p.sent)}; ${pluralize(p.failed, "number")} failed`);
    }
    onDone?.(p);
  }, [router]);

  const cancel = useCallback(() => { stop.current = true; }, []);
  return { progress, running, drive, cancel, clear: () => setProgress(null) };
}

/** The live count while a blast goes out. */
export function BlastProgress({ progress, running, onClose }: { progress: Progress | null; running: boolean; onClose: () => void }) {
  if (!progress) return null;
  const done = progress.sent + progress.failed;
  const finished = !running && (progress.status !== "sending" || progress.queued === 0);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !running) onClose(); }}>
      <DialogContent size="sm" title={running ? "Sending…" : finished ? "Blast finished" : "Blast paused"}
        description={running ? "Keep this page open; it asks the server for the next batch every few seconds." : finished ? "Every number has an answer from the gateway." : "Nothing more is being sent. Resume it from History whenever you like."}>
        <p className="mb-2 text-xs font-semibold text-ink-2">{formatNumber(done)} of {formatNumber(progress.recipients)} answered by the gateway</p>
        <Meter value={done} max={Math.max(progress.recipients, 1)} label={`${formatNumber(done)} of ${formatNumber(progress.recipients)} answered`} tone={progress.failed ? "warning" : "accent"} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-good-soft px-2 py-2"><p className="text-lg font-extrabold leading-none text-good-ink">{formatNumber(progress.sent)}</p><p className="mt-1 text-[11px] text-good-ink">sent</p></div>
          <div className="rounded-xl bg-surface-2 px-2 py-2"><p className="text-lg font-extrabold leading-none text-ink">{formatNumber(progress.queued)}</p><p className="mt-1 text-[11px] text-ink-3">queued</p></div>
          <div className={`rounded-xl px-2 py-2 ${progress.failed ? "bg-critical-soft" : "bg-surface-2"}`}><p className={`text-lg font-extrabold leading-none ${progress.failed ? "text-critical-ink" : "text-ink"}`}>{formatNumber(progress.failed)}</p><p className={`mt-1 text-[11px] ${progress.failed ? "text-critical-ink" : "text-ink-3"}`}>failed</p></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
