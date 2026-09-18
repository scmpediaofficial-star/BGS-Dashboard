import "server-only";

import { recordEvent } from "@/lib/events";
import type { SocialPostStatus } from "@/lib/domain";
import { loadContext, tendAccounts } from "@/lib/social/accounts";
import { PROVIDERS, isProviderId, validateForProvider } from "@/lib/social/catalog";
import { getProvider } from "@/lib/social/providers";
import type { PublishMedia } from "@/lib/social/providers/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { truncate } from "@/lib/utils";
import type { Json, TablesUpdate } from "@/types/database";

/** How long a network may keep "processing" a video before we call it failed. */
const PENDING_LIMIT_MS = 30 * 60_000;
/** A post being worked on is left alone by other dispatcher runs for this long. */
const LEASE_MS = 50_000;

type Result = { published: number; failed: number; pending: number };

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/**
 * Publishes one post to every channel it targets.
 *
 * Safe to call repeatedly and concurrently: the status flip is an atomic
 * compare-and-set, finished channels are never re-sent, and channels still
 * transcoding video ("pending") are resumed by the next run instead of
 * blocking this one. Called after a manager check, or by the cron endpoint.
 */
export async function dispatchPost(id: string, allowed: SocialPostStatus[] = ["scheduled"]): Promise<Result> {
  const admin = createAdminClient();

  // Claim the post: fresh posts by status, in-flight ones by an expired lease.
  let claim = await admin.from("social_posts").update({ status: "publishing" }).eq("id", id).in("status", allowed.filter((s) => s !== "publishing"))
    .select("id, content, link_url, media_ids, author_id").maybeSingle();
  if (!claim.data && allowed.includes("publishing")) {
    claim = await admin.from("social_posts").update({ status: "publishing" }).eq("id", id).eq("status", "publishing").lt("updated_at", new Date(Date.now() - LEASE_MS).toISOString())
      .select("id, content, link_url, media_ids, author_id").maybeSingle();
  }
  if (claim.error) throw new Error("Could not lock the post for publishing.");
  const post = claim.data;
  if (!post) return { published: 0, failed: 0, pending: 0 };

  const [targetsResult, mediaResult] = await Promise.all([
    admin.from("social_post_targets").select("id, content_override, options, status, attempts, account:social_accounts(*)").eq("post_id", id),
    post.media_ids.length ? admin.from("social_media").select("id, url, jpeg_url, mime_type, alt_text, size_bytes, file_name").in("id", post.media_ids) : Promise.resolve({ data: [] }),
  ]);
  // `in()` loses order: put the media back in the order the author arranged it.
  const byId = new Map((mediaResult.data ?? []).map((m) => [m.id, m]));
  const media: PublishMedia[] = post.media_ids.map((mediaId) => byId.get(mediaId)).filter((m) => m !== undefined)
    .map((m) => ({ url: m.url, jpegUrl: m.jpeg_url, mimeType: m.mime_type, altText: m.alt_text, sizeBytes: Number(m.size_bytes), fileName: m.file_name }));

  const failures: { channel: string; error: string }[] = [];
  let published = 0, pending = 0;

  for (const target of targetsResult.data ?? []) {
    if (target.status === "published") { published++; continue; }
    if (target.status === "skipped") continue;

    const options = asRecord(target.options);
    const resume = target.status === "publishing" ? asRecord(options._pending) : null;
    const channel = target.account ? `${PROVIDERS[target.account.provider as keyof typeof PROVIDERS]?.name ?? target.account.provider} · ${target.account.display_name}` : "Removed channel";
    const settle = (values: TablesUpdate<"social_post_targets">) => admin.from("social_post_targets").update(values).eq("id", target.id);

    try {
      if (!target.account || target.account.status !== "active" || !isProviderId(target.account.provider)) throw new Error("This channel is disconnected. Reconnect it under Channels, then retry.");
      const since = Number(options._pending_since) || 0;
      if (resume && Object.keys(resume).length && since && Date.now() - since > PENDING_LIMIT_MS) throw new Error("The network was still processing the media after 30 minutes. Retry, or post this one manually.");

      const text = target.content_override ?? post.content;
      if (!resume || !Object.keys(resume).length) {
        const problem = validateForProvider(target.account.provider, [text, post.link_url].filter(Boolean).join("\n\n"), media.map((m) => ({ mime_type: m.mimeType })));
        if (problem) throw new Error(problem);
        await settle({ status: "publishing", attempts: target.attempts + 1, error: null });
      }

      const { context, app } = await loadContext(target.account);
      const outcome = await getProvider(target.account.provider).publish(context, { text, link: post.link_url, media, options, pending: resume && Object.keys(resume).length ? resume : null }, app);

      if (outcome.status === "pending") {
        await settle({ status: "publishing", error: outcome.note, options: { ...options, _pending: outcome.state, _pending_since: since || Date.now() } as Json });
        pending++;
      } else {
        const { _pending, _pending_since, ...clean } = options;
        void _pending; void _pending_since;
        await settle({ status: "published", external_id: outcome.externalId, external_url: outcome.url, published_at: new Date().toISOString(), error: null, options: clean as Json });
        published++;
      }
    } catch (err) {
      const message = (err instanceof Error ? err.message : "Publishing failed.").slice(0, 500);
      const { _pending, _pending_since, ...clean } = options;
      void _pending; void _pending_since;
      await settle({ status: "failed", error: message, options: clean as Json });
      failures.push({ channel, error: message });
    }
  }

  const failed = failures.length;
  if (pending) {
    // Still waiting on a network: keep the post "publishing" (the update also renews the lease) and come back next minute.
    await admin.from("social_posts").update({ status: "publishing" }).eq("id", id);
    return { published, failed, pending };
  }

  const status: SocialPostStatus = published && failed ? "partial" : published ? "published" : "failed";
  await admin.from("social_posts").update({ status, ...(published ? { published_at: new Date().toISOString() } : {}) }).eq("id", id);

  const label = truncate(post.content || "Media post", 80);
  await recordEvent({
    actor: null, action: `social.${status}`, category: "social", importance: "high", tone: failed ? (published ? "warning" : "critical") : "good",
    summary: status === "published" ? `“${label}” was published to ${published} channel${published === 1 ? "" : "s"}` : status === "partial" ? `“${label}” reached ${published} channel${published === 1 ? "" : "s"} but failed on ${failed}` : `“${label}” could not be published`,
    detail: failed ? "Open the post to see what each network said, fix it and press Retry." : undefined,
    facts: failures.slice(0, 6).map((f) => ({ label: f.channel, value: f.error })),
    entity: { type: "social_post", id, label }, link: `/social/compose?post=${id}`,
    audience: failed ? "managers" : "team", include: [post.author_id],
  });
  return { published, failed, pending };
}

/** One dispatcher tick: everything due, plus anything still waiting on a network. */
export async function dispatchDuePosts(): Promise<{ processed: number; published: number; failed: number; pending: number }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [due, inFlight] = await Promise.all([
    admin.from("social_posts").select("id").eq("status", "scheduled").lte("scheduled_at", now).order("scheduled_at").limit(15),
    admin.from("social_posts").select("id").eq("status", "publishing").lt("updated_at", new Date(Date.now() - LEASE_MS).toISOString()).limit(15),
  ]);
  if (due.error || inFlight.error) throw new Error("Could not read the publishing queue.");

  const totals = { processed: 0, published: 0, failed: 0, pending: 0 };
  for (const row of [...(inFlight.data ?? []), ...(due.data ?? [])]) {
    try {
      const result = await dispatchPost(row.id, ["scheduled", "publishing"]);
      totals.processed++;
      totals.published += result.published; totals.failed += result.failed; totals.pending += result.pending;
    } catch (err) {
      console.error("[dispatch] post", row.id, err);
    }
  }
  return totals;
}

/** Once a day is plenty for login upkeep; the dispatcher calls this on the hour. */
export async function tendAccountsHourly(): Promise<void> {
  if (new Date().getUTCMinutes() !== 0) return;
  try { await tendAccounts(); } catch (err) { console.error("[social] account upkeep failed", err); }
}
