"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

/** Shown until BULKSMSGH_API_KEY is set and a sender ID has been chosen. */
export function SmsSetup({ configured, senderMissing, canManage }: { configured: boolean; senderMissing: boolean; canManage: boolean }) {
  return (
    <Card className="mb-5">
      <CardHeader title={configured ? "One more step before the first blast" : "Connect BulkSMSGH"} description={configured ? "The gateway is connected; it still needs the name people will see as the sender." : "Two steps, done once."} />
      <CardBody>
        <ol className="grid gap-4 text-[13px] leading-relaxed text-ink-2">
          {!configured && (
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">1</span>
              <span>Sign in at <strong className="font-semibold text-ink">clientlogin.bulksmsgh.com</strong>, open <strong className="font-semibold text-ink">API Documentation</strong> and generate an API key. Add it to this deployment as the environment variable <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-ink">BULKSMSGH_API_KEY</code> (Vercel → Project → Settings → Environment Variables), then redeploy.</span>
            </li>
          )}
          <li className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">{configured ? 1 : 2}</span>
            <span>Under <strong className="font-semibold text-ink">Settings → SMS</strong>, enter the <strong className="font-semibold text-ink">sender ID</strong> BulkSMSGH has approved for the summit (up to 11 characters, e.g. BGS2026). Messages sent under an unapproved name are refused by the gateway.{senderMissing && configured ? " This is the only step left." : ""}</span>
          </li>
        </ol>
        {canManage && <Button asChild className="mt-4" variant="outline"><Link href="/settings?tab=sms">Open SMS settings</Link></Button>}
      </CardBody>
    </Card>
  );
}
