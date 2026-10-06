"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadAudience } from "./audience";
import { GROUP_KEYS, GROUPS, type GroupKey, type Progress, type Recipient, type SendInput } from "@/components/sms/types";
import { ActionError, check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability, type Session } from "@/lib/auth/session";
import { recordEvent } from "@/lib/events";
import { getSettings, type AppSettings } from "@/lib/settings";
import { FATAL_CODES, getSmsBalance, isSmsConfigured, sendSms } from "@/lib/sms/gateway";
import { hasNameToken, parseNumberList, plainText, renderSms, smsLength } from "@/lib/sms/text";
import { pluralize, truncate } from "@/lib/utils";

/**
 * A blast is sent in rounds. Each round claims a few numbers, sends them,
 * writes every answer straight away and hands back after ~20 seconds — well
 * inside the server's time allowance — so a thousand people take several
 * short calls (the browser keeps calling) and a server that stops mid-way
 * loses nothing: whatever is still queued can be resumed by anyone.
 */
const MAX_RECIPIENTS = 5000;
const PER_REQUEST = 50; // numbers per gateway call when everyone gets the same text
// Each round must end well inside the server's 60-second allowance even if the last gateway call waits its full timeout.
const ROUND_MS = 20_000;
/** A blast nobody has driven for this long is stalled: its in-flight claims are released on resume. */
const STALL_MS = 3 * 60_000;

const sendSchema = z.object({
  message: z.string().transform(plainText).pipe(z.string().trim().min(1, "Write the message first.").max(1000, "Keep the message under 1,000 characters.")),
  groups: z.array(z.enum(GROUP_KEYS)).max(GROUP_KEYS.length).default([]),
  manual: z.string().max(400_000, "That list is too long. Send it in parts.").default(""),
  excluded: z.array(z.string().max(20)).max(MAX_RECIPIENTS).default([]),
});

async function ready(): Promise<AppSettings> {
  if (!isSmsConfigured()) throw new ActionError("Bulk SMS is not connected yet. Add BULKSMSGH_API_KEY to the deployment's environment variables.");
  const settings = await getSettings();
  if (!settings.sms.sender_id.trim()) throw new ActionError("Set the sender ID under Settings → SMS before sending.");
  return settings;
}

/** Starts a blast: the list is rebuilt on the server, the campaign and every number are written, then the first round goes out. */
export async function sendCampaign(input: SendInput): Promise<ActionResult<Progress>> {
  return run(async () => {
    const session = await requireCapability("sms.send");
    const data = sendSchema.parse(input);
    const settings = await ready();

    const audience = await loadAudience(session.supabase, settings.sms.country_code);
    const excluded = new Set(data.excluded);
    const seen = new Set<string>();
    const recipients: Recipient[] = [];
    const skipped: { name: string | null; raw: string }[] = [];
    for (const group of data.groups) {
      for (const r of audience.recipients[group]) {
        if (excluded.has(r.phone) || seen.has(r.phone)) continue;
        seen.add(r.phone); recipients.push(r);
      }
    }
    for (const row of parseNumberList(data.manual, settings.sms.country_code)) {
      if (!row.phone) { skipped.push({ name: row.name, raw: row.raw }); continue; }
      if (excluded.has(row.phone) || seen.has(row.phone)) continue;
      seen.add(row.phone); recipients.push({ key: row.phone, name: row.name, phone: row.phone, source: "manual", detail: null });
    }
    if (!recipients.length) throw new ActionError(skipped.length ? "None of those numbers could be read. Check them and try again." : "Choose at least one list or add some numbers.");
    if (recipients.length > MAX_RECIPIENTS) throw new ActionError(`That is ${recipients.length.toLocaleString("en-GB")} people. Send to at most ${MAX_RECIPIENTS.toLocaleString("en-GB")} at a time.`);

    const id = await createCampaign(session, settings, { message: data.message, groups: data.groups, recipients, skipped });
    const progress = await runRound(session, id, settings);
    revalidatePath("/", "layout");
    return progress;
  });
}

/** Sends the next round of a blast that is still going (or resumes one that stalled). The browser calls this until nothing is queued. */
export async function continueCampaign(campaignId: string): Promise<ActionResult<Progress>> {
  return run(async () => {
    const session = await requireCapability("sms.send");
    const id = f.id.parse(campaignId);
    const settings = await ready();
    const campaign = one(await session.supabase.from("sms_campaigns").select("id, status, last_activity_at, created_at").eq("id", id).single());
    if (campaign.status !== "sending") return progressOf(session, id);
    // Numbers claimed by a round that never finished (the server stopped) go back in the queue.
    const lastActivity = new Date(campaign.last_activity_at ?? campaign.created_at).getTime();
    if (Date.now() - lastActivity > STALL_MS) check(await session.supabase.from("sms_messages").update({ status: "queued" }).eq("campaign_id", id).eq("status", "sending"));
    const progress = await runRound(session, id, settings);
    revalidatePath("/", "layout");
    return progress;
  });
}

/** A fresh blast with the same wording to the numbers that failed last time. */
export async function resendFailed(campaignId: string): Promise<ActionResult<Progress>> {
  return run(async () => {
    const session = await requireCapability("sms.send");
    const id = f.id.parse(campaignId);
    const settings = await ready();
    const before = one(await session.supabase.from("sms_campaigns").select("id, message, audience").eq("id", id).single());
    const failed = check(await session.supabase.from("sms_messages").select("to_phone, name, source").eq("campaign_id", id).eq("status", "failed")) ?? [];
    if (!failed.length) throw new ActionError("Nothing failed in that blast, so there is nobody to send to again.");
    const seen = new Set<string>();
    const recipients: Recipient[] = [];
    for (const m of failed) {
      if (seen.has(m.to_phone)) continue;
      seen.add(m.to_phone); recipients.push({ key: m.to_phone, name: m.name, phone: m.to_phone, source: (m.source as Recipient["source"]) ?? "manual", detail: null });
    }
    const groups = (Array.isArray(before.audience) ? before.audience : []).filter((g): g is GroupKey => typeof g === "string" && g in GROUPS);
    const newId = await createCampaign(session, settings, { message: before.message, groups, recipients, skipped: [], retryOf: id });
    const progress = await runRound(session, newId, settings);
    revalidatePath("/", "layout");
    return progress;
  });
}

type Job = { message: string; groups: GroupKey[]; recipients: Recipient[]; skipped: { name: string | null; raw: string }[]; retryOf?: string };

async function createCampaign({ profile, supabase }: Session, settings: AppSettings, job: Job): Promise<string> {
  const personalised = hasNameToken(job.message);
  const length = smsLength(renderSms(job.message, personalised ? "Abena" : null, settings.sms.signature));
  const needed = job.recipients.length * length.segments;
  const balance = await getSmsBalance();
  if (balance.units !== null && balance.units < needed) {
    throw new ActionError(`This needs ${needed.toLocaleString("en-GB")} SMS credits (${job.recipients.length.toLocaleString("en-GB")} people × ${length.segments} ${length.segments === 1 ? "part" : "parts"}) but the account has ${balance.units.toLocaleString("en-GB")}. Top up at BulkSMSGH or send to fewer people.`);
  }
  const campaign = one(await supabase.from("sms_campaigns").insert({
    message: job.message, sender_id: settings.sms.sender_id.trim(), audience: job.groups, segments: length.segments, recipients: job.recipients.length, sent_by: profile.id,
    last_activity_at: new Date().toISOString(), ...(job.retryOf ? { error: null } : {}),
  }).select("id").single());
  const rows = [
    ...job.recipients.map((r) => ({ campaign_id: campaign.id, to_phone: r.phone, name: r.name, source: r.source, status: "queued" })),
    ...job.skipped.map((s) => ({ campaign_id: campaign.id, to_phone: truncate(s.raw, 40), name: s.name, source: "manual", status: "skipped", error: "Not a phone number" })),
  ];
  for (let i = 0; i < rows.length; i += 500) check(await supabase.from("sms_messages").insert(rows.slice(i, i + 500)));
  return campaign.id;
}

type Claimed = { id: string; to_phone: string; name: string | null };

/** Sends for up to ROUND_MS, writing each gateway answer as it arrives, then reports where the blast stands. */
async function runRound(session: Session, id: string, settings: AppSettings): Promise<Progress> {
  const { supabase } = session;
  const campaign = one(await supabase.from("sms_campaigns").select("id, message, sender_id, status").eq("id", id).single());
  if (campaign.status !== "sending") return progressOf(session, id);
  const personalised = hasNameToken(campaign.message);
  const signature = settings.sms.signature;
  const started = Date.now();
  let fatal: string | null = null;
  let emptyClaims = 0;

  while (Date.now() - started < ROUND_MS && !fatal) {
    // Claim a slice: only rows still queued become ours, so two rounds never text the same person.
    const queued = check(await supabase.from("sms_messages").select("id").eq("campaign_id", id).eq("status", "queued").order("created_at").limit(personalised ? 12 : 100)) ?? [];
    if (!queued.length) break;
    const mine = (check(await supabase.from("sms_messages").update({ status: "sending" }).in("id", queued.map((q) => q.id)).eq("status", "queued").select("id, to_phone, name")) ?? []) as Claimed[];
    if (!mine.length) { if (++emptyClaims > 2) break; continue; }

    const batches: { rows: Claimed[]; text: string }[] = [];
    if (personalised) for (const m of mine) batches.push({ rows: [m], text: renderSms(campaign.message, m.name, signature) });
    else {
      const text = renderSms(campaign.message, null, signature);
      for (let i = 0; i < mine.length; i += PER_REQUEST) batches.push({ rows: mine.slice(i, i + PER_REQUEST), text });
    }

    const settle = async (rows: Claimed[], status: "sent" | "failed", code: number | null, error: string | null) => {
      check(await supabase.from("sms_messages").update({ status, code, error }).in("id", rows.map((r) => r.id)));
    };
    const sendBatch = async (b: { rows: Claimed[]; text: string }): Promise<void> => {
      if (fatal) { await settle(b.rows, "failed", null, fatal); return; }
      const reply = await sendSms(b.rows.map((r) => r.to_phone), b.text, campaign.sender_id);
      if (reply.ok) { await settle(b.rows, "sent", reply.code, null); return; }
      if (reply.code !== null && FATAL_CODES.has(reply.code)) fatal = reply.error ?? "The gateway refused the blast";
      // One bad number can sink a whole batch: try the rest of that batch one by one.
      if (b.rows.length > 1 && !fatal) { for (const r of b.rows) await sendBatch({ rows: [r], text: b.text }); return; }
      await settle(b.rows, "failed", reply.code, reply.error ?? "Failed");
    };
    const queue = [...batches];
    await Promise.all(Array.from({ length: personalised ? 6 : 2 }, async () => { for (let b = queue.shift(); b; b = queue.shift()) await sendBatch(b); }));
    await touch(session, id);
  }

  if (fatal) {
    // The account itself was refused (no credits, bad key, sender not approved): nothing more will go through.
    check(await supabase.from("sms_messages").update({ status: "failed", error: fatal }).eq("campaign_id", id).in("status", ["queued", "sending"]));
  }
  return finalise(session, id, settings, fatal);
}

async function touch({ supabase }: Session, id: string) {
  const counts = await countStatuses(supabase, id);
  check(await supabase.from("sms_campaigns").update({ sent: counts.sent, failed: counts.failed, last_activity_at: new Date().toISOString() }).eq("id", id));
}

async function countStatuses(supabase: Session["supabase"], id: string) {
  const [queued, sending, sent, failed] = await Promise.all([
    supabase.from("sms_messages").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "queued"),
    supabase.from("sms_messages").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "sending"),
    supabase.from("sms_messages").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "sent"),
    supabase.from("sms_messages").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "failed"),
  ]);
  return { queued: (queued.count ?? 0) + (sending.count ?? 0), sent: sent.count ?? 0, failed: failed.count ?? 0 };
}

async function progressOf(session: Session, id: string): Promise<Progress> {
  const campaign = one(await session.supabase.from("sms_campaigns").select("id, recipients, status").eq("id", id).single());
  const counts = await countStatuses(session.supabase, id);
  return { id, recipients: campaign.recipients, status: campaign.status, ...counts };
}

/** Closes the blast once nothing is queued, and tells the team exactly once. */
async function finalise(session: Session, id: string, settings: AppSettings, fatal: string | null): Promise<Progress> {
  const { profile, supabase } = session;
  const campaign = one(await supabase.from("sms_campaigns").select("id, message, recipients, status, audience, segments").eq("id", id).single());
  const counts = await countStatuses(supabase, id);
  if (campaign.status !== "sending" || counts.queued > 0) {
    check(await supabase.from("sms_campaigns").update({ sent: counts.sent, failed: counts.failed, last_activity_at: new Date().toISOString() }).eq("id", id));
    return { id, recipients: campaign.recipients, status: campaign.status, ...counts };
  }
  const status = counts.sent === 0 ? "failed" : counts.failed === 0 ? "sent" : "partial";
  const firstError = fatal ?? (status === "sent" ? null : (check(await supabase.from("sms_messages").select("error").eq("campaign_id", id).eq("status", "failed").not("error", "is", null).limit(1)) ?? [])[0]?.error ?? null);
  // Only the round that flips "sending" to its final state announces it.
  const closed = check(await supabase.from("sms_campaigns").update({ status, sent: counts.sent, failed: counts.failed, error: firstError, completed_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
    .eq("id", id).eq("status", "sending").select("id")) ?? [];
  if (closed.length) {
    const groups = (Array.isArray(campaign.audience) ? campaign.audience : []).filter((g): g is GroupKey => typeof g === "string" && g in GROUPS).map((g) => GROUPS[g].label);
    await recordEvent({
      actor: { id: profile.id, name: profile.full_name }, action: "sms.sent", category: "sms",
      summary: status === "failed" ? `tried to text ${pluralize(campaign.recipients, "person", "people")} but the SMS blast failed` : `texted ${pluralize(counts.sent, "person", "people")}${counts.failed ? ` (${counts.failed} failed)` : ""}`,
      detail: truncate(campaign.message, 200), entity: { type: "sms_campaign", id, label: truncate(campaign.message, 60) }, link: `/sms?campaign=${id}`,
      importance: "high", tone: status === "sent" ? "good" : status === "partial" ? "warning" : "critical", audience: settings.sms.alert_audience,
      facts: [{ label: "Sent", value: String(counts.sent) }, { label: "Failed", value: String(counts.failed) }, { label: "Lists", value: groups.length ? groups.join(", ") : "Typed or uploaded numbers" }, { label: "SMS parts each", value: String(campaign.segments) }],
    });
  }
  return { id, recipients: campaign.recipients, status, ...counts };
}
