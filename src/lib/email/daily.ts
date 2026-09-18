import "server-only";

import { digestEmail } from "@/lib/email/templates";
import { sendEmails } from "@/lib/email/send";
import { recordEvent } from "@/lib/events";
import { readPrefs } from "@/lib/notifications";
import { getBrand, getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysUntil, formatDate, formatMoney, isoDay, timeAgo, truncate } from "@/lib/utils";

/** 06:00 Accra briefing. The email log makes retries safe within the same day. */
export async function sendDailyBriefing(): Promise<{ recipients: number; sent: number; skipped: number; failed: number }> {
  const db = createAdminClient();
  const today = isoDay();
  const [profiles, overdue, deliverables, actions, approvals, sales, activity, logs, settings, brand] = await Promise.all([
    db.from("profiles").select("email, full_name, notification_prefs").eq("is_active", true),
    db.from("deliverables").select("id", { count: "exact", head: true }).neq("status", "completed").lt("due_date", today),
    db.from("deliverables").select("id, title, due_date, status").neq("status", "completed").not("due_date", "is", null).lt("due_date", today).order("due_date").limit(8),
    db.from("action_items").select("id, title, due_date, status").neq("status", "done").order("due_date").limit(6),
    db.from("social_posts").select("id, content").eq("status", "pending_approval").limit(5),
    db.from("ticket_sales").select("quantity, amount, currency, payment_status").eq("payment_status", "paid"),
    db.from("activity_log").select("actor_name, summary, created_at").gte("created_at", `${today}T00:00:00Z`).order("created_at", { ascending: false }).limit(6),
    db.from("email_log").select("to_email").eq("template", "daily-briefing").gte("created_at", `${today}T00:00:00Z`),
    getSettings(), getBrand(),
  ]);
  const already = new Set((logs.data ?? []).map((x) => x.to_email.toLowerCase()));
  const recipients = (profiles.data ?? []).filter((p) => readPrefs(p.notification_prefs).digest && !already.has(p.email.toLowerCase()));
  const salesRows = sales.data ?? [];
  const ticketCount = salesRows.reduce((sum, sale) => sum + sale.quantity, 0);
  const revenue = salesRows.filter((sale) => sale.currency === "GHS").reduce((sum, sale) => sum + sale.amount, 0);
  const attention = [
    ...(deliverables.data ?? []).map((x) => ({ title: x.title, meta: `Deliverable · due ${formatDate(x.due_date)}`, link: `/deliverables?item=${x.id}` })),
    ...(actions.data ?? []).filter((x) => x.due_date && x.due_date <= today).map((x) => ({ title: x.title, meta: `Action point · due ${formatDate(x.due_date)}`, link: `/meetings?item=${x.id}` })),
    ...(approvals.data ?? []).map((x) => ({ title: truncate(x.content || "Media post", 80), meta: "Social post awaiting approval", link: `/social/compose?post=${x.id}` })),
  ].slice(0, 12);
  const stats = [
    { label: "Paid tickets", value: String(ticketCount) },
    { label: "GHS revenue", value: formatMoney(revenue, "GHS", true) },
    { label: "Overdue deliverables", value: String(overdue.count ?? 0) },
    { label: "Posts to approve", value: String(approvals.data?.length ?? 0) },
  ];
  const messages = recipients.map((person) => ({ to: person.email, template: "daily-briefing", ...digestEmail({ brand, name: person.full_name,
    dateLabel: formatDate(today, { weekday: true }), daysToGo: daysUntil(settings.event.starts_at), stats, attention,
    activity: (activity.data ?? []).map((entry) => ({ text: `${entry.actor_name ?? "System"} ${entry.summary}`, when: timeAgo(entry.created_at) })) }) }));
  const results = await sendEmails(messages);
  if (messages.length) await recordEvent({ actor: null, action: "system.daily_briefing", category: "system", summary: `prepared the daily briefing for ${messages.length} team members`, link: "/settings/email", audience: "none", importance: "low" });
  return { recipients: messages.length, sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length, failed: results.filter((r) => r.status === "failed").length };
}
