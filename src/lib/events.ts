import "server-only";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrand, getSettings } from "@/lib/settings";
import { alertEmail, type EmailTone, type Fact } from "@/lib/email/templates";
import { sendEmails, type OutgoingEmail } from "@/lib/email/send";
import { sendPush } from "@/lib/push";
import { CATEGORIES, readPrefs, type Category } from "@/lib/notifications";
import { roleRank, type Role } from "@/lib/auth/permissions";
import type { Json } from "@/types/database";

export type Actor = { id: string; name: string } | null;

export type EventInput = {
  /** Who did it. `null` for the system (cron jobs, publishing engine). */
  actor: Actor;
  /** Machine name, e.g. "deliverable.status_changed". */
  action: string;
  category: Category;
  /** Sentence fragment that follows the actor's name: `moved “Brochure” to In progress`. */
  summary: string;
  /** One supporting line for the email and notification body. */
  detail?: string;
  entity?: { type: string; id: string; label: string };
  /** In-app path the alert opens. */
  link: string;
  importance?: "low" | "normal" | "high";
  tone?: EmailTone;
  facts?: Fact[];
  /** Who hears about it. Default: the whole active team. */
  audience?: "team" | "managers" | "admins" | "none";
  /** People who are always told, e.g. a new assignee — even outside the audience. */
  include?: (string | null | undefined)[];
  meta?: Record<string, Json>;
};

const AUDIENCE_MIN: Record<"team" | "managers" | "admins", Role> = { team: "viewer", managers: "manager", admins: "admin" };

/**
 * The single entry point for "something happened".
 *
 * Writes the audit trail immediately, then — after the response has been sent,
 * so the person who acted never waits on it — fans out in-app notifications,
 * branded Resend emails (respecting each person's preferences) and web push.
 */
export async function recordEvent(input: EventInput): Promise<void> {
  const db = createAdminClient();

  const { error } = await db.from("activity_log").insert({
    actor_id: input.actor?.id ?? null,
    actor_name: input.actor?.name ?? "System",
    action: input.action,
    category: input.category,
    entity_type: input.entity?.type ?? null,
    entity_id: input.entity?.id ?? null,
    entity_label: input.entity?.label ?? null,
    summary: input.summary,
    link: input.link,
    meta: (input.meta ?? {}) as Json,
  });
  if (error) console.error("[events] activity_log insert failed:", error.message);

  after(() => fanOut(input).catch((err) => console.error("[events] fan-out failed:", err)));
}

async function fanOut(input: EventInput): Promise<void> {
  const db = createAdminClient();
  const audience = input.audience ?? "team";
  const include = new Set((input.include ?? []).filter((id): id is string => Boolean(id)));

  const { data: people } = await db
    .from("profiles")
    .select("id, email, full_name, role, notification_prefs")
    .eq("is_active", true);

  const recipients = (people ?? []).filter((p) => {
    if (p.id === input.actor?.id) return false;
    if (include.has(p.id)) return true;
    if (audience === "none") return false;
    return roleRank(p.role) >= roleRank(AUDIENCE_MIN[audience]);
  });
  if (!recipients.length) return;

  const [settings, brand] = await Promise.all([getSettings(), getBrand()]);
  const importance = input.importance ?? "normal";
  const headline = input.actor ? `${input.actor.name} ${input.summary}` : capitalise(input.summary);

  // Decide each person's email route first so the notification row can record it.
  const routed = recipients.map((person) => {
    const prefs = readPrefs(person.notification_prefs);
    const direct = include.has(person.id); // addressed to them personally
    let mode = prefs.email[input.category];
    // Workspace-wide volume control: keep instant email for what matters, brief the rest.
    if (mode === "instant" && settings.email.volume === "important" && importance !== "high" && !direct) mode = "digest";
    return { person, prefs, mode };
  });

  const { error } = await db.from("notifications").insert(
    routed.map(({ person, mode, prefs }) => ({
      user_id: person.id,
      category: input.category,
      importance,
      title: headline,
      body: input.detail ?? null,
      link: input.link,
      actor_id: input.actor?.id ?? null,
      actor_name: input.actor?.name ?? "System",
      entity_type: input.entity?.type ?? null,
      entity_id: input.entity?.id ?? null,
      // Only "digest" rows are still owed to the daily briefing.
      digest_sent: !(mode === "digest" && prefs.digest),
    })),
  );
  if (error) console.error("[events] notifications insert failed:", error.message);

  const emails: OutgoingEmail[] = routed
    .filter(({ mode, person }) => mode === "instant" && person.email)
    .map(({ person }) => ({
      to: person.email,
      template: `alert:${input.action}`,
      ...alertEmail({
        brand,
        category: CATEGORIES[input.category].label,
        actorName: input.actor?.name ?? null,
        summary: input.summary,
        detail: input.detail,
        facts: input.facts,
        link: input.link,
        tone: input.tone,
      }),
    }));

  const pushTo = routed.filter(({ prefs }) => prefs.push).map(({ person }) => person.id);

  await Promise.all([
    sendEmails(emails),
    sendPush(pushTo, { title: headline, body: input.detail, url: input.link, tag: input.entity ? `${input.entity.type}:${input.entity.id}` : input.action }),
  ]);
}

function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
