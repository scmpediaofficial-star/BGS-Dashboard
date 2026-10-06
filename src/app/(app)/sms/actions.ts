"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadAudience } from "./audience";
import { GROUP_KEYS, GROUPS, type GroupKey, type Recipient, type SendInput } from "@/components/sms/types";
import { ActionError, check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability, type Session } from "@/lib/auth/session";
import { recordEvent } from "@/lib/events";
import { getSettings } from "@/lib/settings";
import { FATAL_CODES, isSmsConfigured, sendSms } from "@/lib/sms/gateway";
import { hasNameToken, parseNumberList, plainText, renderSms, smsLength } from "@/lib/sms/text";
import { pluralize, truncate } from "@/lib/utils";

const MAX_RECIPIENTS = 5000;
const PER_REQUEST = 50;

const sendSchema = z.object({
  message: z.string().transform(plainText).pipe(z.string().trim().min(1, "Write the message first.").max(1000, "Keep the message under 1,000 characters.")),
  groups: z.array(z.enum(GROUP_KEYS)).max(GROUP_KEYS.length).default([]),
  manual: z.string().max(400_000, "That list is too long. Send it in parts.").default(""),
  excluded: z.array(z.string().max(20)).max(MAX_RECIPIENTS).default([]),
});

export type SendOutcome = { id: string; recipients: number; sent: number; failed: number; skipped: number };

/** Sends one message to everyone chosen, logging the campaign and every number as it goes. */
export async function sendCampaign(input: SendInput): Promise<ActionResult<SendOutcome>> {
  return run(async () => {
    const session = await requireCapability("sms.send");
    const data = sendSchema.parse(input);
    const settings = await getSettings();
    if (!isSmsConfigured()) throw new ActionError("Bulk SMS is not connected yet. Add BULKSMSGH_API_KEY to the deployment's environment variables.");
    const senderId = settings.sms.sender_id.trim();
    if (!senderId) throw new ActionError("Set the sender ID under Settings → SMS before sending.");

    // Rebuild the list on the server: the browser only says which lists and which numbers to leave out.
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

    const outcome = await dispatch(session, { message: data.message, senderId, signature: settings.sms.signature, groups: data.groups, recipients, skipped });
    revalidatePath("/", "layout");
    return outcome;
  });
}

/** A fresh blast with the same wording to the numbers that failed last time. */
export async function resendFailed(campaignId: string): Promise<ActionResult<SendOutcome>> {
  return run(async () => {
    const session = await requireCapability("sms.send");
    const id = f.id.parse(campaignId);
    const settings = await getSettings();
    if (!isSmsConfigured()) throw new ActionError("Bulk SMS is not connected yet. Add BULKSMSGH_API_KEY to the deployment's environment variables.");
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
    const outcome = await dispatch(session, { message: before.message, senderId: settings.sms.sender_id.trim(), signature: "", groups, recipients, skipped: [], retryOf: id });
    revalidatePath("/", "layout");
    return outcome;
  });
}

type Job = { message: string; senderId: string; signature: string; groups: GroupKey[]; recipients: Recipient[]; skipped: { name: string | null; raw: string }[]; retryOf?: string };

/** Writes the campaign, sends in batches, then writes what happened. Never leaves a campaign "sending" on its own account. */
async function dispatch({ profile, supabase }: Session, job: Job): Promise<SendOutcome> {
  const personalised = hasNameToken(job.message);
  const length = smsLength(renderSms(job.message, personalised ? "Abena" : null, job.signature));
  const campaign = one(await supabase.from("sms_campaigns").insert({
    message: job.message, sender_id: job.senderId, audience: job.groups, segments: length.segments, recipients: job.recipients.length, sent_by: profile.id,
  }).select("id").single());

  // Every number gets a row first, so a blast interrupted half-way still shows who was reached.
  const rows = [
    ...job.recipients.map((r) => ({ campaign_id: campaign.id, to_phone: r.phone, name: r.name, source: r.source, status: "queued" })),
    ...job.skipped.map((s) => ({ campaign_id: campaign.id, to_phone: truncate(s.raw, 40), name: s.name, source: "manual", status: "skipped", error: "Not a phone number" })),
  ];
  const ids: string[] = [];
  for (let i = 0; i < rows.length; i += 500) ids.push(...(check(await supabase.from("sms_messages").insert(rows.slice(i, i + 500)).select("id")) ?? []).map((r) => r.id));
  const idOf = new Map(job.recipients.map((r, n) => [r.phone, ids[n]]));

  // Same wording → one request for up to 50 numbers. {name} makes each text its own, sent a few at a time.
  const batches: { phones: string[]; text: string }[] = [];
  if (personalised) for (const r of job.recipients) batches.push({ phones: [r.phone], text: renderSms(job.message, r.name, job.signature) });
  else {
    const text = renderSms(job.message, null, job.signature);
    for (let i = 0; i < job.recipients.length; i += PER_REQUEST) batches.push({ phones: job.recipients.slice(i, i + PER_REQUEST).map((r) => r.phone), text });
  }

  const results = new Map<string, { status: "sent" | "failed"; code: number | null; error: string | null }>();
  let fatal: string | null = null;
  const sendBatch = async (b: { phones: string[]; text: string }) => {
    if (fatal) { for (const p of b.phones) results.set(p, { status: "failed", code: null, error: fatal }); return; }
    const reply = await sendSms(b.phones, b.text, job.senderId);
    if (reply.ok) { for (const p of b.phones) results.set(p, { status: "sent", code: reply.code, error: null }); return; }
    if (reply.code !== null && FATAL_CODES.has(reply.code)) fatal = reply.error ?? "The gateway refused the blast";
    // One bad number can sink a whole batch: try the rest of that batch one by one.
    if (b.phones.length > 1 && !fatal) { for (const p of b.phones) await sendBatch({ phones: [p], text: b.text }); return; }
    for (const p of b.phones) results.set(p, { status: "failed", code: reply.code, error: reply.error ?? "Failed" });
  };
  const queue = [...batches];
  const workers = Array.from({ length: personalised ? 6 : 2 }, async () => { for (let b = queue.shift(); b; b = queue.shift()) await sendBatch(b); });
  await Promise.all(workers);

  // Record the answers, grouped so a thousand numbers are a handful of updates.
  const byOutcome = new Map<string, { ids: string[]; status: string; code: number | null; error: string | null }>();
  for (const [phone, r] of results) {
    const id = idOf.get(phone);
    if (!id) continue;
    const key = `${r.status}|${r.code}|${r.error}`;
    (byOutcome.get(key) ?? byOutcome.set(key, { ids: [], ...r }).get(key)!).ids.push(id);
  }
  for (const group of byOutcome.values()) {
    for (let i = 0; i < group.ids.length; i += 200) check(await supabase.from("sms_messages").update({ status: group.status, code: group.code, error: group.error }).in("id", group.ids.slice(i, i + 200)));
  }

  const sent = [...results.values()].filter((r) => r.status === "sent").length;
  const failed = job.recipients.length - sent;
  const status = sent === 0 ? "failed" : failed === 0 ? "sent" : "partial";
  const firstError = [...results.values()].find((r) => r.error)?.error ?? null;
  check(await supabase.from("sms_campaigns").update({ status, sent, failed, error: fatal ?? (status === "sent" ? null : firstError), completed_at: new Date().toISOString() }).eq("id", campaign.id));

  const lists = job.groups.map((g) => GROUPS[g].label);
  const settings = await getSettings();
  await recordEvent({
    actor: { id: profile.id, name: profile.full_name }, action: job.retryOf ? "sms.resent" : "sms.sent", category: "sms",
    summary: status === "failed" ? `tried to text ${pluralize(job.recipients.length, "person", "people")} but the SMS blast failed` : `texted ${pluralize(sent, "person", "people")}${failed ? ` (${failed} failed)` : ""}${job.retryOf ? " again" : ""}`,
    detail: truncate(job.message, 200), entity: { type: "sms_campaign", id: campaign.id, label: truncate(job.message, 60) }, link: `/sms?campaign=${campaign.id}`,
    importance: "high", tone: status === "sent" ? "good" : status === "partial" ? "warning" : "critical", audience: settings.sms.alert_audience,
    facts: [{ label: "Sent", value: String(sent) }, { label: "Failed", value: String(failed) }, { label: "Lists", value: lists.length ? lists.join(", ") : "Typed or uploaded numbers" }, { label: "SMS parts each", value: String(length.segments) }],
  });
  return { id: campaign.id, recipients: job.recipients.length, sent, failed, skipped: job.skipped.length };
}
