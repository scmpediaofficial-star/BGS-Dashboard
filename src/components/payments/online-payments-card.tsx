"use client";

import { useState } from "react";
import { AlarmClock, CircleCheck, CircleSlash, Copy, ExternalLink, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { scheduleOnlinePaymentsClose, setOnlinePayments } from "@/app/(app)/payments/actions";
import { copyText } from "@/components/payments/shared";
import type { Checkout, CheckoutSchedule } from "@/components/payments/types";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { formatDate, formatMoney, formatTime, pluralize, relativeDay } from "@/lib/utils";

/** "today at 18:00", "on 14 Nov 2026 at 09:30" — always Accra time. */
function when(iso: string): string {
  const day = relativeDay(iso);
  return `${/^(Today|Tomorrow|Yesterday)$/.test(day) ? day.toLowerCase() : `on ${formatDate(iso)}`} at ${formatTime(iso)}`;
}

/**
 * Opens and closes every Paystack checkout (the ticket product and the payment pages) at once,
 * and shows when they close by themselves.
 */
export function OnlinePaymentsCard({ checkouts, schedule }: { checkouts: Checkout[] | null; schedule: CheckoutSchedule | null }) {
  const { can } = useViewer();
  const manage = can("payments.manage");
  const [confirm, setConfirm] = useState<"close" | "open" | null>(null);
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState("");

  const [setOpen, switching] = useAction(setOnlinePayments, {
    success: (r) => (r.failed.length ? `${pluralize(r.changed, "checkout")} changed. Still to change in Paystack: ${r.failed.join(", ")}` : confirm === "open" ? "Online payments reopened" : "Online payments closed"),
    onSuccess: () => setConfirm(null),
  });
  const [saveTime, savingTime] = useAction(scheduleOnlinePaymentsClose, { success: "Close time saved", onSuccess: () => setEditing(false) });
  const [cancelTime, cancelling] = useAction(scheduleOnlinePaymentsClose, { success: "Scheduled close cancelled", onSuccess: () => setEditing(false) });

  if (!checkouts) {
    return <Card className="mb-5 p-4 text-xs text-ink-3">Paystack did not list its payment pages and products just now, so online payments cannot be opened or closed from here. Refresh in a moment.</Card>;
  }

  const open = checkouts.filter((c) => c.open);
  const status = !checkouts.length ? null : open.length === checkouts.length ? "open" : open.length ? "partly" : "closed";
  // A close time that has just passed still reads as upcoming: the scheduler carries it out within the minute.
  const upcoming = schedule?.closeAt && !schedule.closedAt ? schedule.closeAt : null;

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-ink">Online payments</h2>
            {status === "open" && <Badge tone="good" icon={LockKeyholeOpen}>Open</Badge>}
            {status === "partly" && <Badge tone="warning" icon={LockKeyholeOpen}>{open.length} of {checkouts.length} open</Badge>}
            {status === "closed" && <Badge tone="neutral" icon={LockKeyhole}>Closed</Badge>}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {upcoming && open.length
              ? <>Every checkout below closes by itself <span className="font-semibold text-ink-2">{when(upcoming)}</span> (Accra time).</>
              : schedule?.closedAt && !open.length
                ? `Closed ${when(schedule.closedAt)}. Nobody can pay on Paystack until they are reopened.`
                : open.length
                  ? "No close time is set: payments stay open until someone closes them."
                  : "Nobody can pay on Paystack until they are reopened."}
          </p>
        </div>
        {manage && checkouts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {open.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => { setTime((upcoming ?? "").slice(0, 16)); setEditing(true); }}>
                <AlarmClock /> {upcoming ? "Change close time" : "Schedule close"}
              </Button>
            )}
            {open.length > 0
              ? <Button variant="danger" size="sm" onClick={() => setConfirm("close")}><LockKeyhole /> Close all now</Button>
              : <Button variant="outline" size="sm" onClick={() => setConfirm("open")}><LockKeyholeOpen /> Reopen all</Button>}
          </div>
        )}
      </div>

      {checkouts.length === 0
        ? <p className="p-4 text-xs text-ink-3 sm:px-5">There are no payment pages or products on Paystack.</p>
        : (
          <ul className="divide-y divide-line">
            {checkouts.map((c) => (
              <li key={c.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-2.5 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{c.name}</p>
                  <p className="text-xs text-ink-3">{c.amount === null ? "Customer decides the amount" : formatMoney(c.amount, c.currency)} · {c.kind === "product" ? "Product" : "Payment page"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={c.open ? "good" : "neutral"} icon={c.open ? CircleCheck : CircleSlash} size="sm">{c.open ? "Taking payments" : "Closed"}</Badge>
                  {c.url && (
                    <>
                      <Button variant="ghost" size="icon-sm" aria-label={`Copy the link to ${c.name}`} onClick={() => copyText(c.url!, "Link")}><Copy /></Button>
                      <Button asChild variant="ghost" size="icon-sm"><a href={c.url} target="_blank" rel="noreferrer" aria-label={`Open ${c.name} on Paystack`}><ExternalLink /></a></Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

      <ConfirmDialog
        open={confirm === "close"} onOpenChange={(next) => !next && setConfirm(null)} destructive loading={switching}
        title="Close all online payments now?"
        description={`${open.map((c) => c.name).join(", ")} will stop taking payments straight away. Payments already made are not affected, and you can reopen them here at any time.`}
        confirmLabel="Close all now" onConfirm={() => setOpen(false)}
      />
      <ConfirmDialog
        open={confirm === "open"} onOpenChange={(next) => !next && setConfirm(null)} loading={switching}
        title="Reopen all online payments?"
        description={`${checkouts.map((c) => c.name).join(", ")} will take payments again.`}
        confirmLabel="Reopen all" onConfirm={() => setOpen(true)}
      />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent
          title={upcoming ? "Change when payments close" : "Schedule when payments close"}
          description="At this time every Paystack payment page and product stops taking payments, without anyone pressing anything."
          footer={
            <>
              {upcoming && <Button variant="danger-ghost" className="mr-auto" loading={cancelling} onClick={() => cancelTime(null)}>Cancel scheduled close</Button>}
              <Button variant="outline" onClick={() => setEditing(false)}>Keep as is</Button>
              <Button form="close-time-form" type="submit" loading={savingTime}>Save time</Button>
            </>
          }
        >
          <form id="close-time-form" onSubmit={(e) => { e.preventDefault(); if (time) saveTime(`${time}:00Z`); }}>
            {/* Accra keeps GMT all year, so the time typed here is UTC. */}
            <Field label="Close at (Accra time)" htmlFor="close-at"><Input id="close-at" type="datetime-local" required value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
