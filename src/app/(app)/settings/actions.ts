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
    check(await db.rpc("configure_scheduler", { app_url: url, secret: cronSecret() }));
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
