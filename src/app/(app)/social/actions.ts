"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, check, f, one, run, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/auth/permissions";
import { requireCapability } from "@/lib/auth/session";
import { recordEvent } from "@/lib/events";
import { saveApp, saveDiscovered } from "@/lib/social/accounts";
import { PROVIDERS, isProviderId, validateForProvider, type ProviderId } from "@/lib/social/catalog";
import { dispatchPost } from "@/lib/social/dispatch";
import { getProvider } from "@/lib/social/providers";
import { ProviderError } from "@/lib/social/providers/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime, truncate } from "@/lib/utils";
import type { Json } from "@/types/database";

const optionValue = z.union([z.string().max(300), z.boolean(), z.number(), z.null()]);
const targetSchema = z.object({ account_id: f.id, content_override: f.optionalText(10000), options: z.record(z.string().max(40), optionValue).default({}) });
const postSchema = z.object({
  id: f.optionalId, content: z.string().trim().max(10000), link_url: f.optionalUrl, campaign: f.optionalText(160), notes: f.optionalText(3000),
  tags: z.array(f.text(80)).max(30).default([]), media_ids: z.array(f.id).max(10).default([]), targets: z.array(targetSchema).max(20).default([]),
  /** draft = keep working · submit = ask a manager · schedule / publish = managers only */
  mode: z.enum(["draft", "submit", "schedule", "publish"]).default("draft"),
  scheduled_at: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.iso.datetime({ offset: true }).nullable()).default(null),
});
export type PostInput = z.input<typeof postSchema>;

export async function savePost(input: PostInput): Promise<ActionResult<{ id: string; published?: number; failed?: number; pending?: number }>> {
  return run(async () => {
    const { profile, role, supabase } = await requireCapability("social.draft");
    const data = postSchema.parse(input);
    const label = truncate(data.content || "Media post", 80);
    if (!data.content && !data.media_ids.length) throw new ActionError("Add text or media before saving.");
    if ((data.mode === "schedule" || data.mode === "publish") && !can(role, "social.publish")) throw new ActionError("Only managers can schedule or publish. Submit it for approval instead.");
    if (data.mode !== "draft" && !data.targets.length) throw new ActionError("Choose at least one channel.");
    if (data.mode === "schedule" && (!data.scheduled_at || Date.parse(data.scheduled_at) <= Date.now() + 30_000)) throw new ActionError("Pick a time in the future, or use Publish now.");

    const ids = data.targets.map((t) => t.account_id);
    const accounts = ids.length ? check(await supabase.from("social_accounts").select("id, provider, display_name, status").in("id", ids)) ?? [] : [];
    if (accounts.length !== new Set(ids).size || accounts.some((a) => a.status !== "active")) throw new ActionError("One of the selected channels is disconnected. Remove it or reconnect it.");

    // Anything leaving draft must already satisfy every network's rules — better here than at 12:30 on the day.
    if (data.mode !== "draft") {
      const media = data.media_ids.length ? check(await supabase.from("social_media").select("id, mime_type").in("id", data.media_ids)) ?? [] : [];
      for (const target of data.targets) {
        const account = accounts.find((a) => a.id === target.account_id)!;
        if (!isProviderId(account.provider)) continue;
        const text = [target.content_override ?? data.content, data.link_url].filter(Boolean).join("\n\n");
        const problem = validateForProvider(account.provider, text, media);
        if (problem) throw new ActionError(`${account.display_name}: ${problem}`);
      }
    }

    const status = data.mode === "submit" ? "pending_approval" as const : data.mode === "schedule" ? "scheduled" as const : "draft" as const;
    const values = {
      content: data.content, link_url: data.link_url ?? null, campaign: data.campaign ?? null, notes: data.notes ?? null, tags: data.tags, media_ids: data.media_ids,
      status, scheduled_at: data.scheduled_at, rejection_note: data.mode === "draft" ? undefined : null,
      ...(data.mode === "schedule" ? { approver_id: profile.id, approved_at: new Date().toISOString() } : {}),
    };

    let id = data.id ?? null;
    if (id) {
      const before = one(await supabase.from("social_posts").select("status").eq("id", id).single());
      const editable = ["draft", "pending_approval", ...(can(role, "social.publish") ? ["scheduled", "failed", "partial"] : [])];
      if (!editable.includes(before.status)) throw new ActionError("This post can no longer be edited.");
      check(await supabase.from("social_posts").update(values).eq("id", id));
      // Channels that already received it keep their record; everything else is rebuilt from the form.
      check(await supabase.from("social_post_targets").delete().eq("post_id", id).neq("status", "published"));
    } else {
      id = one(await supabase.from("social_posts").insert({ ...values, author_id: profile.id }).select("id").single()).id;
    }
    const kept = check(await supabase.from("social_post_targets").select("account_id").eq("post_id", id)) ?? [];
    const fresh = data.targets.filter((t) => !kept.some((k) => k.account_id === t.account_id));
    if (fresh.length) {
      check(await supabase.from("social_post_targets").insert(fresh.map((t) => ({
        post_id: id!, account_id: t.account_id, content_override: t.content_override ?? null,
        options: Object.fromEntries(Object.entries(t.options).filter(([key]) => !key.startsWith("_"))) as Json, // "_" keys belong to the publishing engine
      }))));
    }

    const actor = { id: profile.id, name: profile.full_name };
    const entity = { type: "social_post", id, label };
    const link = `/social/compose?post=${id}`;
    const channels = accounts.map((a) => a.display_name).join(", ");

    if (data.mode === "publish") {
      const result = await dispatchPost(id, ["draft"]); // reports its own outcome to the team
      revalidatePath("/", "layout");
      return { id, ...result };
    }
    if (data.mode === "submit") {
      await recordEvent({ actor, action: "social.submitted", category: "social", summary: `submitted “${label}” for approval`, entity, link, audience: "managers", importance: "high",
        facts: [{ label: "Channels", value: channels }, ...(data.scheduled_at ? [{ label: "Requested time", value: formatDateTime(data.scheduled_at) }] : [])] });
    } else if (data.mode === "schedule") {
      await recordEvent({ actor, action: "social.scheduled", category: "social", summary: `scheduled “${label}”`, entity, link, importance: "normal",
        facts: [{ label: "Goes out", value: formatDateTime(data.scheduled_at) }, { label: "Channels", value: channels }] });
    } else {
      await recordEvent({ actor, action: data.id ? "social.updated" : "social.created", category: "social", summary: `${data.id ? "updated the draft" : "drafted"} “${label}”`, entity, link, importance: "low" });
    }
    revalidatePath("/", "layout");
    return { id };
  });
}

export async function approvePost(id: string, scheduledAt: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("social.publish");
    const input = z.object({ id: f.id, scheduledAt: z.iso.datetime() }).parse({ id, scheduledAt });
    if (Date.parse(input.scheduledAt) <= Date.now()) throw new ActionError("Choose a future time, or use Publish now.");
    const row = one(await supabase.from("social_posts").select("content, status, author_id").eq("id", id).single());
    if (!["draft", "pending_approval", "failed", "partial"].includes(row.status)) throw new ActionError("This post cannot be scheduled from its current status.");
    const targets = check(await supabase.from("social_post_targets").select("id").eq("post_id", id));
    if (!targets?.length) throw new ActionError("Choose a channel before scheduling.");
    check(await supabase.from("social_posts").update({ status: "scheduled", scheduled_at: input.scheduledAt, approver_id: profile.id, approved_at: new Date().toISOString(), rejection_note: null }).eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "social.scheduled", category: "social", summary: `scheduled “${truncate(row.content || "Media post", 80)}”`,
      entity: { type: "social_post", id, label: row.content.slice(0, 80) || "Media post" }, link: `/social/compose?post=${id}`, include: [row.author_id], importance: "high" });
    revalidatePath("/", "layout"); return undefined;
  }, "Post scheduled");
}

export async function rejectPost(id: string, note: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("social.publish");
    const input = z.object({ id: f.id, note: f.text(1000) }).parse({ id, note });
    const row = one(await supabase.from("social_posts").select("content, author_id, status").eq("id", id).single());
    if (row.status !== "pending_approval") throw new ActionError("This post is no longer awaiting approval.");
    check(await supabase.from("social_posts").update({ status: "draft", rejection_note: input.note, scheduled_at: null }).eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "social.rejected", category: "social", summary: `returned “${truncate(row.content || "Media post", 80)}” for changes`, detail: input.note,
      entity: { type: "social_post", id, label: row.content.slice(0, 80) || "Media post" }, link: `/social/compose?post=${id}`, include: [row.author_id], importance: "high", tone: "warning" });
    revalidatePath("/", "layout"); return undefined;
  }, "Post returned for changes");
}

export async function publishNow(id: string): Promise<ActionResult<{ published: number; failed: number }>> {
  return run(async () => {
    const { supabase } = await requireCapability("social.publish");
    const row = one(await supabase.from("social_posts").select("status").eq("id", f.id.parse(id)).single());
    if (!["draft", "pending_approval", "scheduled", "failed", "partial"].includes(row.status)) throw new ActionError("This post cannot be published from its current status.");
    const targets = check(await supabase.from("social_post_targets").select("id").eq("post_id", id));
    if (!targets?.length) throw new ActionError("Choose a channel before publishing.");
    const result = await dispatchPost(id, [row.status]);
    revalidatePath("/", "layout");
    return result;
  });
}

export async function deletePost(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("social.draft");
    const row = one(await supabase.from("social_posts").select("content").eq("id", f.id.parse(id)).single());
    check(await supabase.from("social_posts").delete().eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "social.deleted", category: "social", summary: `removed social post “${truncate(row.content || "Media post", 80)}”`, link: "/social", importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  });
}

const appSchema = z.object({
  provider: z.string().refine(isProviderId, "Unknown network."), client_id: f.text(200), client_secret: f.optionalText(400),
  pages: z.boolean().default(false), api_version: f.optionalText(12).refine((v) => !v || /^(v\d{1,2}\.\d|\d{6})$/.test(v), "Use a version like v25.0 or 202608."),
});

/** Saves a network's developer-app keys (encrypted). Leaving the secret empty keeps the one already stored. */
export async function saveProviderApp(input: z.input<typeof appSchema>): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("social.accounts");
    const data = appSchema.parse(input);
    const provider = data.provider as ProviderId;
    if (PROVIDERS[provider].auth !== "oauth" || PROVIDERS[provider].appProvider) throw new ActionError("That network doesn't use a developer app.");
    const existing = await createAdminClient().from("social_apps").select("provider").eq("provider", provider).maybeSingle();
    if (!existing.data && !data.client_secret) throw new ActionError("Enter the app's secret.");
    await saveApp(provider, data.client_id, data.client_secret ?? null, { ...(data.pages ? { pages: true } : {}), ...(data.api_version ? { api_version: data.api_version } : {}) }, profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "social.app_saved", category: "system", summary: `saved the ${PROVIDERS[provider].name} developer app`, link: "/social/accounts", audience: "admins", importance: "low" });
    revalidatePath("/social/accounts");
    return undefined;
  }, "App saved — you can connect now");
}

/** Token / app-password networks: verify what was pasted against the live service before storing anything. */
export async function connectWithCredentials(provider: string, fields: Record<string, string>): Promise<ActionResult<{ count: number }>> {
  return run(async () => {
    const { profile } = await requireCapability("social.accounts");
    if (!isProviderId(provider) || PROVIDERS[provider].auth !== "credentials") throw new ActionError("That network doesn't connect this way.");
    const clean = z.record(z.string().max(40), z.string().max(2000)).parse(fields);
    const adapter = getProvider(provider);
    let accounts;
    try {
      accounts = await adapter.connect!(clean);
    } catch (err) {
      throw new ActionError(err instanceof ProviderError ? err.message : "Could not verify those details. Check them and try again.");
    }
    const saved = await saveDiscovered(accounts, profile.id);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "social.account_connected", category: "social", summary: `connected ${saved[0]?.name ?? PROVIDERS[provider].name} on ${PROVIDERS[provider].name}`,
      link: "/social/accounts", audience: "admins", importance: "high", tone: "good" });
    revalidatePath("/", "layout");
    return { count: saved.length };
  }, "Channel connected");
}

/** A channel that rehearses the whole workflow without posting anywhere. */
export async function addPracticeChannel(): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("social.accounts");
    await saveDiscovered([{ provider: "sandbox", externalId: "practice", displayName: "Practice channel", accountType: "practice", tokens: { accessToken: "none", expiresAt: null } }], profile.id);
    revalidatePath("/", "layout");
    return undefined;
  }, "Practice channel added");
}

export async function disconnectAccount(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile } = await requireCapability("social.accounts");
    const admin = createAdminClient();
    const account = one(await admin.from("social_accounts").select("display_name").eq("id", f.id.parse(id)).single());
    check(await admin.from("social_account_secrets").delete().eq("account_id", id));
    check(await admin.from("social_accounts").update({ status: "expired", status_detail: "Disconnected by an administrator" }).eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "social.account_disconnected", category: "social", summary: `disconnected ${account.display_name}`,
      link: "/social/accounts", audience: "admins", importance: "high", tone: "warning" });
    revalidatePath("/", "layout"); return undefined;
  });
}

const mediaSchema = z.object({ path: f.text(500), url: f.optionalUrl, file_name: f.text(250), mime_type: f.text(100), size_bytes: z.number().int().min(1).max(52_428_800), alt_text: f.optionalText(500),
  jpeg_path: f.optionalText(500), width: f.optionalInt, height: f.optionalInt, duration_seconds: z.number().min(0).max(36000).nullable().optional() });
export async function registerMedia(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("social.draft");
    const data = mediaSchema.parse(input);
    if (!data.path.startsWith(`${profile.id}/`)) throw new ActionError("Invalid media path.");
    if (!/^(image|video)\//.test(data.mime_type)) throw new ActionError("Use an image or video file.");
    if (data.jpeg_path && !data.jpeg_path.startsWith(`${profile.id}/`)) throw new ActionError("Invalid media path.");
    const jpegUrl = data.jpeg_path ? supabase.storage.from("social-media").getPublicUrl(data.jpeg_path).data.publicUrl : null;
    const publicUrl = supabase.storage.from("social-media").getPublicUrl(data.path).data.publicUrl;
    const row = one(await supabase.from("social_media").insert({ bucket: "social-media", path: data.path, url: publicUrl, file_name: data.file_name,
      mime_type: data.mime_type, size_bytes: data.size_bytes, alt_text: data.alt_text ?? null, uploaded_by: profile.id,
      jpeg_path: data.jpeg_path ?? null, jpeg_url: jpegUrl, width: data.width ?? null, height: data.height ?? null, duration_seconds: data.duration_seconds ?? null }).select("id").single());
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "social.media_uploaded", category: "social", summary: `uploaded ${data.file_name} to the media library`,
      entity: { type: "social_media", id: row.id, label: data.file_name }, link: "/social/media", importance: "low" });
    revalidatePath("/", "layout"); return { id: row.id };
  });
}

export async function deleteMedia(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("social.draft");
    const row = one(await supabase.from("social_media").select("path, jpeg_path, file_name").eq("id", f.id.parse(id)).single());
    const { data: linked } = await supabase.from("social_posts").select("id").contains("media_ids", [id]).limit(1);
    if (linked?.length) throw new ActionError("This file is attached to a post. Remove it from the post first.");
    check(await supabase.from("social_media").delete().eq("id", id));
    const { error } = await supabase.storage.from("social-media").remove([row.path, ...(row.jpeg_path ? [row.jpeg_path] : [])]);
    if (error) console.error("[social] storage remove failed:", error.message);
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "social.media_deleted", category: "social", summary: `removed ${row.file_name} from the media library`, link: "/social/accounts", importance: "low" });
    revalidatePath("/", "layout"); return undefined;
  });
}
