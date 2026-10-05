import Link from "next/link";
import { CreditCard, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";

const HEADER = { eyebrow: "Commercial", title: "Payments", description: "Paystack inside the dashboard: payments, customers, refunds and payouts — and a ticket for everyone who pays." };

/** Shown until PAYSTACK_SECRET_KEY is set. */
export function PaymentsSetup({ webhookUrl }: { webhookUrl: string }) {
  return (
    <>
      <PageHeader {...HEADER} />
      <Card>
        <CardHeader title="Connect Paystack" description="Two steps, done once." />
        <CardBody>
          <ol className="grid gap-4 text-[13px] leading-relaxed text-ink-2">
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">1</span>
              <span>In Paystack, open <strong className="font-semibold text-ink">Settings → API Keys &amp; Webhooks</strong> and copy the <strong className="font-semibold text-ink">live secret key</strong>. Add it to this deployment as the environment variable <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-ink">PAYSTACK_SECRET_KEY</code> (Vercel → Project → Settings → Environment Variables), then redeploy.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">2</span>
              <span>On the same Paystack page, set the <strong className="font-semibold text-ink">live webhook URL</strong> to <code className="break-all rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-ink">{webhookUrl}</code> so each payment reaches the ticket ledger the moment it is made. Without it, payments still arrive within five minutes while the scheduler is on.</span>
            </li>
          </ol>
        </CardBody>
      </Card>
    </>
  );
}

/** Paystack is connected but did not answer (wrong key, outage, no network). */
export function PaymentsUnavailable({ message }: { message: string }) {
  return (
    <>
      <PageHeader {...HEADER} />
      <Card>
        <EmptyState icon={message.includes("key") ? TriangleAlert : CreditCard} title="Paystack could not be reached" description={message}
          action={<Button asChild variant="outline"><Link href="/payments"><RefreshCw /> Try again</Link></Button>} />
      </Card>
    </>
  );
}
