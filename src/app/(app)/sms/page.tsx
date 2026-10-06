import type { Metadata } from "next";
import { loadAudience } from "./audience";
import { SmsView } from "@/components/sms/sms-view";
import type { Campaign, Message } from "@/components/sms/types";
import { requireRole } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { getSmsBalance, isSmsConfigured } from "@/lib/sms/gateway";

export const metadata: Metadata = { title: "Bulk SMS" };
// A blast to a thousand numbers takes a while; Server Actions on this page get the same allowance.
export const maxDuration = 60;

export default async function SmsPage({ searchParams }: PageProps<"/sms">) {
  const { supabase } = await requireRole("manager");
  const params = await searchParams;
  const openId = typeof params.campaign === "string" ? params.campaign : null;
  const tab = params.tab === "history" || openId ? "history" : "compose";
  const settings = await getSettings();
  const configured = isSmsConfigured();

  const [audience, balance, campaigns, messages] = await Promise.all([
    loadAudience(supabase, settings.sms.country_code),
    configured ? getSmsBalance() : Promise.resolve(null),
    supabase.from("sms_campaigns").select("id, message, sender_id, audience, segments, recipients, sent, failed, status, error, created_at, completed_at, sender:profiles!sms_campaigns_sent_by_fkey(full_name)").order("created_at", { ascending: false }).limit(100),
    openId ? supabase.from("sms_messages").select("id, campaign_id, to_phone, name, source, status, code, error").eq("campaign_id", openId).order("created_at") : Promise.resolve({ data: [] }),
  ]);

  return (
    <SmsView
      tab={tab}
      configured={configured}
      balance={balance}
      sms={settings.sms}
      audience={audience}
      campaigns={((campaigns.data ?? []) as unknown as Campaign[]).map((c) => ({ ...c, audience: Array.isArray(c.audience) ? c.audience : [] }))}
      openId={openId}
      openMessages={(messages.data ?? []) as Message[]}
    />
  );
}
