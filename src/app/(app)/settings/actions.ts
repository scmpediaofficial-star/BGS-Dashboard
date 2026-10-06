"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, check, f, run, type ActionResult } from "@/lib/actions";
import { requireCapability, requireSession } from "@/lib/auth/session";
import { cronSecret } from "@/lib/crypto";
import { testEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { recordEvent } from "@/lib/events";
import { readPrefs } from "@/lib/notifications";
import { getBrand, getSettings, saveSetting } from "@/lib/settings";
import { isSmsConfigured, sendSms } from "@/lib/sms/gateway";
import { normalisePhone, renderSms } from "@/lib/sms/text";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

const eventSchema = z.object({ name: f.text(200), short_name: f.text(80), theme: f.text(220), tagline: f.text(300), starts_at: z.iso.datetime(),
  venue: f.text(160), city: f.text(100), convener: f.text(160), website: z.url(), email: f.email, phone: f.text(80), whatsapp: f.optionalText(80), address: f.optionalText(300) });

export async function saveEventSettings(input: Record<string, unknown>): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    const data = eventSchema.parse(input);
    await saveSetting("event", { ...data, whatsapp: data.whatsapp ?? undefined, address: data.address ?? undefined }, profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.event_updated", category: "system", summary: "updated the summit details", link: "/settings", audience: "admins", importance: "normal" });
    revalidatePath("/", "layout"); return undefined;
  }, "Summit details saved");
}

const targetsSchema = z.object({ tickets: f.optionalInt, tickets_note: f.optionalText(300), revenue: f.optionalMoney, sponsorship: f.optionalMoney, currency: z.enum(["GHS", "USD"]) });
export async function saveTargets(input: Record<string, unknown>): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    const data = targetsSchema.parse(input);
    await saveSetting("targets", { tickets: data.tickets ?? null, tickets_note: data.tickets_note ?? undefined, revenue: data.revenue ?? null,
      sponsorship: data.sponsorship ?? null, currency: data.currency }, profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.targets_updated", category: "system", summary: "updated summit targets", link: "/settings", audience: "managers", importance: "normal" });
    revalidatePath("/", "layout"); return undefined;
  }, "Targets saved");
}

const ticketSettingsSchema = z.object({ capacity: f.optionalInt, count_blank_complimentary: z.boolean(), payment_alerts: z.boolean(), refund_alerts: z.boolean(),
  alert_audience: z.enum(["team", "managers", "admins"]), auto_import: z.boolean(), auto_customers: z.boolean(), admit_label: f.text(40) });
export async function saveTicketSettings(input: Record<string, unknown>): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    const { capacity, ...tickets } = ticketSettingsSchema.parse(input);
    const before = await getSettings();
    await saveSetting("tickets", tickets, profile.id);
    // "Seats available" is the ticket target under another name: one number, two places to change it.
    await saveSetting("targets", { ...before.targets, tickets: capacity ?? null }, profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.tickets_updated", category: "system", summary: "updated the ticket and payment settings", link: "/settings?tab=tickets", audience: "admins", importance: "normal",
      facts: [{ label: "Seats available", value: capacity === null || capacity === undefined ? "No limit" : String(capacity) }, { label: "Payment alerts", value: tickets.payment_alerts ? "On" : "Off" }, { label: "Automatic import", value: tickets.auto_import ? "On" : "Off" }] });
    revalidatePath("/", "layout"); return undefined;
  }, "Ticket and payment settings saved");
}

const ticketTypesSchema = z.array(z.object({ id: f.id, name: f.text(120), price: f.optionalMoney, is_active: z.boolean() })).min(1).max(20);
export async function saveTicketTypes(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("settings.manage");
    const rows = ticketTypesSchema.parse(input);
    const existing = check(await supabase.from("ticket_types").select("id, is_virtual")) ?? [];
    const virtual = new Map(existing.map((t) => [t.id, t.is_virtual]));
    if (rows.some((r) => !virtual.has(r.id))) throw new ActionError("One of those ticket types no longer exists. Reload the page and try again.");
    // Paystack payments are issued against the in-person ticket, so one must stay on sale.
    if (!rows.some((r) => r.is_active && virtual.get(r.id) === false)) throw new ActionError("Keep at least one in-person ticket on sale: Paystack payments are issued against it.");
    for (const row of rows) check(await supabase.from("ticket_types").update({ name: row.name, price: row.price ?? null, is_active: row.is_active }).eq("id", row.id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.ticket_types_updated", category: "system", summary: "updated the ticket prices", link: "/settings?tab=tickets", audience: "managers", importance: "normal" });
    revalidatePath("/", "layout"); return undefined;
  }, "Ticket prices saved");
}

export async function saveWorkspaceLists(input: { organizations: string; sponsor_packages: string }): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    const schema = z.object({ organizations: z.string().max(3000), sponsor_packages: z.string().max(3000) });
    const data = schema.parse(input);
    const lines = (value: string) => [...new Set(value.split("\n").map((x) => x.trim()).filter(Boolean))].slice(0, 100);
    await saveSetting("organizations", lines(data.organizations), profile.id);
    await saveSetting("sponsor_packages", lines(data.sponsor_packages), profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.lists_updated", category: "system", summary: "updated organisations and sponsor packages", link: "/settings", audience: "admins", importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  }, "Lists saved");
}

export async function saveEmailSettings(volume: "all" | "important"): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    const value = z.enum(["all", "important"]).parse(volume);
    await saveSetting("email", { volume: value }, profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.email_updated", category: "system", summary: `set email alerts to ${value}`, link: "/settings/email", audience: "admins", importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  }, "Email settings saved");
}

export async function sendTestEmail(): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    const result = await sendEmail({ to: profile.email, template: "test", ...testEmail({ brand: await getBrand(), name: profile.full_name }) });
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.test_email", category: "system", summary: `ran an email test (${result.status})`, link: "/settings/email", audience: "admins", importance: "low" });
    if (result.status !== "sent") throw new ActionError(result.status === "skipped" ? "RESEND_API_KEY is not configured. The preview is in the email log." : "Resend could not send the message. Check the email log.");
    revalidatePath("/", "layout"); return undefined;
  }, "Test email sent");
}

const modes = ["instant", "digest", "off"] as const;
const prefsSchema = z.object({ email: z.record(z.string(), z.enum(modes)), push: z.boolean(), digest: z.boolean() });
export async function saveNotificationPrefs(input: Record<string, unknown>): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireSession();
    const data = prefsSchema.parse(input);
    const prefs = readPrefs(data);
    check(await supabase.from("profiles").update({ notification_prefs: prefs as unknown as Json }).eq("id", profile.id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.notifications_updated", category: "system", summary: "updated their notification preferences", link: "/settings/notifications", audience: "none", importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  }, "Notification preferences saved");
}

export async function configureScheduler(appUrl: string): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    const url = z.url().parse(appUrl).replace(/\/+$/, "");
    const db = createAdminClient();
    // Local development: pg_net runs inside Supabase's Docker network, where "localhost" is the
    // container itself. Docker Desktop exposes the host machine as host.docker.internal.
    const reachable = url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/, "$1host.docker.internal");
    check(await db.rpc("configure_scheduler", { app_url: reachable, secret: cronSecret() }));
    await saveSetting("scheduler", { enabled: true, app_url: url, configured_at: new Date().toISOString() }, profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.scheduler_enabled", category: "system", summary: "enabled scheduled publishing and daily briefings", link: "/settings", audience: "admins", importance: "high", tone: "good" });
    revalidatePath("/", "layout"); return undefined;
  }, "Scheduler enabled");
}

export async function disableScheduler(): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    const db = createAdminClient();
    check(await db.rpc("disable_scheduler"));
    const before = await getSettings();
    await saveSetting("scheduler", { enabled: false, app_url: before.scheduler.app_url, configured_at: before.scheduler.configured_at }, profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.scheduler_disabled", category: "system", summary: "disabled scheduled publishing and daily briefings", link: "/settings", audience: "admins", importance: "high", tone: "warning" });
    revalidatePath("/", "layout"); return undefined;
  }, "Scheduler disabled");
}

export async function savePushSubscription(input: { endpoint: string; p256dh: string; auth: string; user_agent?: string }): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireSession();
    const data = z.object({ endpoint: z.url().max(3000), p256dh: f.text(500), auth: f.text(500), user_agent: f.optionalText(500) }).parse(input);
    check(await supabase.from("push_subscriptions").upsert({ user_id: profile.id, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth,
      user_agent: data.user_agent ?? null }, { onConflict: "endpoint" }));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.push_enabled", category: "system", summary: "enabled push alerts on a device", link: "/settings/notifications", audience: "none", importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  }, "Push alerts enabled");
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireSession();
    const value = z.url().max(3000).parse(endpoint);
    check(await supabase.from("push_subscriptions").delete().eq("endpoint", value).eq("user_id", profile.id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.push_disabled", category: "system", summary: "disabled push alerts on a device", link: "/settings/notifications", audience: "none", importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  }, "Push alerts disabled");
}

// ── Bulk SMS ────────────────────────────────────────────────────────────────
const smsSettingsSchema = z.object({ sender_id: z.string().trim().min(1, "Enter the sender ID.").max(11, "A sender ID is at most 11 characters, spaces included."),
  country_code: z.string().trim().regex(/^\d{1,3}$/, "Choose a country."), signature: z.string().trim().max(60, "Keep the signature under 60 characters."), alert_audience: z.enum(["team", "managers", "admins"]) });
export async function saveSmsSettings(input: Record<string, unknown>): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    const data = smsSettingsSchema.parse(input);
    await saveSetting("sms", data, profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "settings.sms_updated", category: "system", summary: "updated the SMS settings", link: "/settings?tab=sms", audience: "admins", importance: "normal",
      facts: [{ label: "Sender ID", value: data.sender_id }, { label: "Alerts go to", value: data.alert_audience }] });
    revalidatePath("/", "layout"); return undefined;
  }, "SMS settings saved");
}

/** One real text to one number, so the key and the sender ID can be proved before a blast. Not logged as a campaign. */
export async function sendTestSms(to: string): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    if (!isSmsConfigured()) throw new ActionError("Bulk SMS is not connected yet. Add BULKSMSGH_API_KEY to the deployment's environment variables.");
    const settings = await getSettings();
    if (!settings.sms.sender_id.trim()) throw new ActionError("Save a sender ID first.");
    const phone = normalisePhone(z.string().max(40).parse(to), settings.sms.country_code);
    if (!phone) throw new ActionError("That doesn't look like a phone number.");
    const reply = await sendSms([phone], renderSms(`Test message from the ${settings.event.short_name} dashboard. If you can read this, bulk SMS is working.`, null, settings.sms.signature), settings.sms.sender_id.trim());
    if (!reply.ok) throw new ActionError(reply.error ?? "The gateway refused the test message.");
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "sms.test_sent", category: "sms", summary: `sent a test SMS to ${phone}`, link: "/settings?tab=sms", audience: "none", importance: "low" });
    return undefined;
  }, "Test message sent");
}

/** Tells every active team member, through the dashboard's own alerts, that bulk SMS is available. */
export async function announceSms(): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("settings.manage");
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "sms.announced", category: "sms",
      summary: "announced that the dashboard can now send bulk SMS",
      detail: "From Commercial → Bulk SMS, managers and admins can text ticket holders, delegates, panelists, outreach contacts, sponsors, the team, or a list typed in or uploaded as a CSV. Every blast is logged number by number, and failed numbers can be sent to again.",
      link: "/sms", audience: "team", importance: "high", tone: "good",
      facts: [{ label: "Who can send", value: "Managers and admins" }, { label: "Where", value: "Commercial → Bulk SMS" }, { label: "Lists", value: "Tickets, programme, outreach, sponsors, team, CSV" }] });
    revalidatePath("/", "layout"); return undefined;
  }, "Announcement sent to the team");
}
