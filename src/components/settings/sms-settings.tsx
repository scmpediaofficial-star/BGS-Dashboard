"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, Megaphone, MessageSquareText, Send } from "lucide-react";
import { announceSms, saveSmsSettings, sendTestSms } from "@/app/(app)/settings/actions";
import { useAction } from "@/components/shared/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import type { AlertAudience, AppSettings } from "@/lib/settings";
import type { SmsBalance } from "@/lib/sms/gateway";

const AUDIENCE: { value: AlertAudience; label: string }[] = [
  { value: "team", label: "Everyone on the team" },
  { value: "managers", label: "Managers and admins" },
  { value: "admins", label: "Admins only" },
];
const COUNTRIES = [["233", "Ghana (+233)"], ["234", "Nigeria (+234)"], ["254", "Kenya (+254)"], ["27", "South Africa (+27)"], ["225", "Côte d’Ivoire (+225)"], ["228", "Togo (+228)"], ["44", "United Kingdom (+44)"], ["1", "USA / Canada (+1)"]] as const;

export function SmsSettings({ settings, connected, balance, announced }: { settings: AppSettings; connected: boolean; balance: SmsBalance | null; announced: string | null }) {
  const [form, setForm] = useState({ ...settings.sms });
  const [testTo, setTestTo] = useState("");
  const [confirmAnnounce, setConfirmAnnounce] = useState(false);
  const [save, saving] = useAction(saveSmsSettings);
  const [test, testing] = useAction(sendTestSms);
  const [announce, announcing] = useAction(announceSms, { onSuccess: () => setConfirmAnnounce(false) });
  const senderLength = form.sender_id.trim().length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><MessageSquareText className="size-4.5" aria-hidden /></span>
          <div><h2 className="text-sm font-bold text-ink">Bulk SMS</h2><p className="mt-0.5 text-xs text-ink-3">How text messages from the dashboard are sent, and who hears about them.</p></div>
        </div>
        <form className="mt-5 grid gap-4" onSubmit={(e) => { e.preventDefault(); save(form); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sender ID" htmlFor="sms-sender" hint={`${senderLength}/11 characters. Must match a name BulkSMSGH has approved for this account.`} error={senderLength > 11 ? "At most 11 characters, spaces included." : undefined}>
              <Input id="sms-sender" required maxLength={11} autoComplete="off" value={form.sender_id} onChange={(e) => setForm({ ...form, sender_id: e.target.value })} placeholder="BGS2026" />
            </Field>
            <Field label="Numbers without a country code are" htmlFor="sms-country" hint="A number typed as 024… is read as this country's.">
              <Select id="sms-country" value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value })}>{COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</Select>
            </Field>
          </div>
          <Field label="Signature" htmlFor="sms-signature" optional hint="Added as a last line on every message, e.g. “- BGS Africa”. Counts towards the length.">
            <Textarea id="sms-signature" rows={2} maxLength={60} value={form.signature} onChange={(e) => setForm({ ...form, signature: e.target.value })} />
          </Field>
          <Field label="Who is told when a blast goes out" htmlFor="sms-audience">
            <Select id="sms-audience" value={form.alert_audience} onChange={(e) => setForm({ ...form, alert_audience: e.target.value as AlertAudience })}>{AUDIENCE.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select>
          </Field>
          <div><Button type="submit" loading={saving} disabled={senderLength === 0 || senderLength > 11}>Save SMS settings</Button></div>
        </form>
      </Card>

      <div className="grid content-start gap-4">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">Gateway</h2>
            <Badge tone={connected ? "good" : "neutral"}>{connected ? "Connected" : "Not connected"}</Badge>
          </div>
          {connected ? (
            <>
              <p className="mt-2 text-xs leading-relaxed text-ink-2">BulkSMSGH is connected through <code className="rounded bg-surface-3 px-1 font-mono text-[11px] text-ink">BULKSMSGH_API_KEY</code>. Credits left: <strong className="font-semibold text-ink">{balance?.label ?? "unknown"}</strong>.</p>
              <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); test(testTo); }}>
                <Field label="Send a test to" htmlFor="sms-test" className="min-w-0 flex-1"><Input id="sms-test" required inputMode="tel" placeholder="024 412 3456" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field>
                <Button type="submit" variant="outline" loading={testing} disabled={!settings.sms.sender_id.trim()}><Send /> Send test</Button>
              </form>
              {!settings.sms.sender_id.trim() && <p className="mt-2 text-xs text-ink-3">Save a sender ID first.</p>}
              <p className="mt-2 text-xs text-ink-3">The test uses one credit and is not kept in the history.</p>
            </>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-ink-2">Generate an API key at <strong className="font-semibold text-ink">clientlogin.bulksmsgh.com → API Documentation</strong>, add it to the deployment as <code className="rounded bg-surface-3 px-1 font-mono text-[11px] text-ink">BULKSMSGH_API_KEY</code> and redeploy. Until then the <Link href="/sms" className="font-semibold text-accent-ink hover:underline">Bulk SMS</Link> page explains the steps and nothing is sent.</p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Megaphone className="size-4.5" aria-hidden /></span>
            <div><h2 className="text-sm font-bold text-ink">Tell the team</h2><p className="mt-0.5 text-xs leading-relaxed text-ink-3">Sends everyone on the team an alert — in the app, by email and by push — that the dashboard can now send bulk SMS, with a link to the page.</p></div>
          </div>
          {announced && <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3"><BellRing aria-hidden className="size-3.5" /> Last announced {announced}.</p>}
          <Button className="mt-4" variant={announced ? "outline" : "primary"} onClick={() => setConfirmAnnounce(true)}><Megaphone /> {announced ? "Announce again" : "Announce to the team"}</Button>
        </Card>
      </div>

      <ConfirmDialog open={confirmAnnounce} onOpenChange={setConfirmAnnounce} title="Announce bulk SMS to the whole team?" confirmLabel="Send the announcement" loading={announcing}
        description="Every active member gets an alert in the app and, depending on their own preferences, an email and a push notification." onConfirm={() => announce()} />
    </div>
  );
}
