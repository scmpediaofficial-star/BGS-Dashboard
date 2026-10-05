"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, RefreshCw, Ticket, UsersRound } from "lucide-react";
import { saveTicketSettings, saveTicketTypes } from "@/app/(app)/settings/actions";
import { useAction } from "@/components/shared/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import type { AlertAudience, AppSettings } from "@/lib/settings";

export type TicketTypeRow = { id: string; name: string; price: number | null; currency: string; is_virtual: boolean; is_active: boolean };

const AUDIENCE: { value: AlertAudience; label: string }[] = [
  { value: "team", label: "Everyone on the team" },
  { value: "managers", label: "Managers and admins" },
  { value: "admins", label: "Admins only" },
];

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] font-semibold text-ink">{label}</label>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

function Heading({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon className="size-4.5" aria-hidden /></span>
      <div><h2 className="text-sm font-bold text-ink">{title}</h2><p className="mt-0.5 text-xs text-ink-3">{description}</p></div>
    </div>
  );
}

/** Settings → Tickets & payments: the numbers, alerts, automation and wording behind the Tickets and Payments screens. */
export function TicketSettings({ settings, ticketTypes, paystackConnected }: { settings: AppSettings; ticketTypes: TicketTypeRow[]; paystackConnected: boolean }) {
  const [form, setForm] = useState({ ...settings.tickets, capacity: settings.targets.tickets === null ? "" : String(settings.targets.tickets) });
  const [types, setTypes] = useState(ticketTypes.map((t) => ({ ...t, price: t.price === null ? "" : String(t.price) })));
  const [save, saving] = useAction(saveTicketSettings);
  const [saveTypes, savingTypes] = useAction(saveTicketTypes);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <form className="contents" onSubmit={(e) => { e.preventDefault(); save(form); }}>
        <Card className="p-5">
          <Heading icon={UsersRound} title="Attendees" description="The totals on the overview and the Tickets page." />
          <div className="mt-4 grid gap-1">
            <Field label="Seats available" htmlFor="ticket-capacity" optional hint="The “of …” beside the total, and the seats left. Leave empty for no limit.">
              <Input id="ticket-capacity" type="number" inputMode="numeric" min="0" max="1000000" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
            </Field>
            <Toggle id="ticket-count-blank" label="Count blank complimentary tickets" checked={form.count_blank_complimentary} onChange={(v) => set("count_blank_complimentary", v)}
              hint="On: every complimentary ticket issued is in “Total with complimentary”. Off: only those with a name on them, so tickets not yet handed out don't inflate the number." />
          </div>
        </Card>

        <Card className="p-5">
          <Heading icon={BellRing} title="Payment alerts" description="Who is told when money comes in or goes back." />
          <div className="mt-2 divide-y divide-line">
            <Toggle id="ticket-payment-alerts" label="Alert when a payment arrives" checked={form.payment_alerts} onChange={(v) => set("payment_alerts", v)}
              hint="One alert for each Paystack payment, with the buyer, the amount and the ticket issued." />
            <Toggle id="ticket-refund-alerts" label="Alert when a payment is refunded or reversed" checked={form.refund_alerts} onChange={(v) => set("refund_alerts", v)}
              hint="Sent when a refund is requested here and when Paystack reverses a payment." />
            <div className="py-3">
              <Field label="Who gets these alerts" htmlFor="ticket-audience" hint="Each person still chooses email, daily briefing or in-app only under My notifications → Tickets & virtual access. With alerts off, the activity log still records every payment.">
                <Select id="ticket-audience" value={form.alert_audience} disabled={!form.payment_alerts && !form.refund_alerts} onChange={(e) => set("alert_audience", e.target.value as AlertAudience)}>
                  {AUDIENCE.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <Heading icon={RefreshCw} title="Paystack automation" description="What happens without anyone pressing a button." />
            <Badge tone={paystackConnected ? "good" : "warning"}>{paystackConnected ? "Paystack connected" : "Paystack not connected"}</Badge>
          </div>
          <div className="mt-2 divide-y divide-line">
            <Toggle id="ticket-auto-import" label="Import payments automatically" checked={form.auto_import} onChange={(v) => set("auto_import", v)}
              hint="On: each successful payment becomes a sale and a ticket by itself. Off: nothing arrives until someone presses Sync tickets on the Payments page." />
            <Toggle id="ticket-auto-customers" label="Add buyers who paid another way to Paystack" checked={form.auto_customers} onChange={(v) => set("auto_customers", v)}
              hint="A sale recorded as paid by bank transfer, cheque or cash adds the buyer to Paystack as a customer, so everyone who has paid has a customer code." />
          </div>
          {!paystackConnected && <p className="mt-3 text-xs text-ink-3">Paystack is connected by adding <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11px] text-ink">PAYSTACK_SECRET_KEY</code> to the deployment. <Link href="/payments" className="font-semibold text-accent-ink hover:underline">See the steps</Link>.</p>}
        </Card>

        <Card className="p-5">
          <Heading icon={Ticket} title="Ticket wording" description="Printed on every e-ticket from now on, including ones downloaded again." />
          <div className="mt-4 grid gap-4">
            <Field label="Line above the name" htmlFor="ticket-admit" hint="On paid and complimentary tickets. Delegates show their role instead.">
              <Input id="ticket-admit" required maxLength={40} value={form.admit_label} onChange={(e) => set("admit_label", e.target.value)} />
            </Field>
            <p className="text-xs leading-relaxed text-ink-3">The date and venue on the ticket come from <Link href="/settings" className="font-semibold text-accent-ink hover:underline">Summit details</Link>.</p>
          </div>
        </Card>

        <div className="xl:col-span-2"><Button type="submit" loading={saving}>Save ticket and payment settings</Button></div>
      </form>

      <Card className="p-5 xl:col-span-2">
        <Heading icon={Ticket} title="Ticket prices" description="A Paystack payment that is an exact multiple of the in-person price is issued that many tickets." />
        {types.length === 0 ? <p className="mt-4 text-xs text-ink-3">No ticket types exist yet.</p> : (
          <form className="mt-4 grid gap-3" onSubmit={(e) => { e.preventDefault(); saveTypes(types.map((t) => ({ id: t.id, name: t.name, price: t.price, is_active: t.is_active }))); }}>
            {types.map((type, index) => {
              const update = (patch: Partial<(typeof types)[number]>) => setTypes((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
              return (
                <div key={type.id} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
                  <Field label={type.is_virtual ? "Name (online pass)" : "Name (in person)"} htmlFor={`type-name-${type.id}`}><Input id={`type-name-${type.id}`} required value={type.name} onChange={(e) => update({ name: e.target.value })} /></Field>
                  <Field label={`Price (${type.currency})`} htmlFor={`type-price-${type.id}`} optional><Input id={`type-price-${type.id}`} type="number" inputMode="decimal" min="0" step="0.01" value={type.price} onChange={(e) => update({ price: e.target.value })} /></Field>
                  <label className="flex h-9.5 items-center gap-2 text-xs font-semibold text-ink-2"><Switch checked={type.is_active} onCheckedChange={(is_active) => update({ is_active })} aria-label={`${type.name} is on sale`} /> On sale</label>
                </div>
              );
            })}
            <div><Button type="submit" variant="outline" loading={savingTypes}>Save ticket prices</Button></div>
          </form>
        )}
      </Card>
    </div>
  );
}
