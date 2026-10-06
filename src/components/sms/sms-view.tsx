"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Coins, Megaphone, Settings } from "lucide-react";
import { useViewer } from "@/components/shell/session-context";
import { SmsCompose } from "@/components/sms/sms-compose";
import { SmsHistory } from "@/components/sms/sms-history";
import { SmsSetup } from "@/components/sms/sms-setup";
import type { Audience, Campaign, Message } from "@/components/sms/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import type { SmsSettings } from "@/lib/settings";
import type { SmsBalance } from "@/lib/sms/gateway";

type Props = { tab: "compose" | "history"; configured: boolean; balance: SmsBalance | null; sms: SmsSettings; audience: Audience; campaigns: Campaign[]; openId: string | null; openMessages: Message[] };

export function SmsView({ tab, configured, balance, sms, audience, campaigns, openId, openMessages }: Props) {
  const { can } = useViewer();
  useRealtimeRefresh(["sms_campaigns", "sms_messages"]);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ready = configured && Boolean(sms.sender_id.trim());

  function setTab(next: string) {
    // Each tab owns its own filters and open record, so none of them follow you across.
    router.replace(next === "compose" ? pathname : `${pathname}?tab=history`, { scroll: false });
  }

  return (
    <>
      <PageHeader eyebrow="Commercial" title="Bulk SMS" description="One text message to everyone who needs it: ticket holders, delegates, panelists, contacts, or a list you upload. Every blast is logged number by number."
        actions={can("settings.manage") ? <Button asChild variant="outline"><Link href="/settings?tab=sms"><Settings /> SMS settings</Link></Button> : undefined} />

      {!ready && <SmsSetup configured={configured} senderMissing={!sms.sender_id.trim()} canManage={can("settings.manage")} />}

      {configured && (
        <Card className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Coins aria-hidden className="size-4.5" /></span>
            <div><p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Credits left</p><p className="text-sm font-bold text-ink">{balance?.label ?? "Unknown"}</p></div>
          </div>
          <div><p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Sender ID</p><p className="text-sm font-bold text-ink">{sms.sender_id.trim() || <span className="text-ink-3">Not set</span>}</p></div>
          <div><p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Gateway</p><Badge tone="good" icon={Megaphone}>BulkSMSGH connected</Badge></div>
          {sms.signature.trim() && <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Signature</p><p className="truncate text-sm text-ink-2">{sms.signature}</p></div>}
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="history">History{campaigns.length ? ` (${campaigns.length})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="compose"><SmsCompose key={params.get("message") ?? ""} audience={audience} sms={sms} balance={balance} ready={ready} canSend={can("sms.send")} initialMessage={params.get("message") ?? ""} /></TabsContent>
        <TabsContent value="history"><SmsHistory campaigns={campaigns} openId={openId} openMessages={openMessages} canSend={can("sms.send")} /></TabsContent>
      </Tabs>
    </>
  );
}
