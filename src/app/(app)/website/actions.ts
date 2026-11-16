"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, check, f, one, run, type ActionResult } from "@/lib/actions";
import { can } from "@/lib/auth/permissions";
import { requireCapability } from "@/lib/auth/session";
import type { ArticleStatus } from "@/lib/domain";
import { recordEvent } from "@/lib/events";
import type { Fact } from "@/lib/email/templates";
import { formatDate, isoDay, pluralize, truncate } from "@/lib/utils";
import {
  ALBUM_PATTERN, ARTICLE_CATEGORIES, BODY_MAX, EXCERPT_MAX, SLUG_MAX, SLUG_PATTERN, articleUrl, galleryFolder, galleryUrl,
} from "@/components/website/types";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** An uploaded image, any https:// image, or a path on the website itself (`/media/news/x.jpg`). */
const imageAddress = z.preprocess(
  emptyToNull,
  z.string().trim().max(2000, "That image address is too long.")
    .refine((v) => /^https?:\/\/\S+$/i.test(v) || /^\/(?!\/)\S*$/.test(v), "Upload an image, or use a full https:// link or a website path starting with /.")
    .nullable().optional(),
);

const articleSchema = z.object({
  id: f.optionalId,
  title: f.text(200),
  slug: z.string().trim().toLowerCase()
    .min(1, "Give the article a web address.")
    .max(SLUG_MAX, `Keep the web address under ${SLUG_MAX} characters.`)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens only, e.g. bgs-2026-opens-in-accra."),
  category: z.enum(ARTICLE_CATEGORIES, "Choose a category."),
  author: f.optionalText(120),
  excerpt: f.optionalText(EXCERPT_MAX),
  body: z.string().max(BODY_MAX, `Keep the article under ${BODY_MAX.toLocaleString("en-GB")} characters.`).default(""),
  cover_url: imageAddress,
  cover_alt: f.optionalText(300),
  published_on: f.optionalDate,
  /** Managers only: publish as part of this save. Otherwise a new article is a draft and an existing one keeps its status. */
  publish: z.boolean().default(false),
});

export type ArticleInput = z.input<typeof articleSchema>;

const link = (id: string) => `/website?item=${id}`;
const galleryLink = (album: string) => `/website/gallery?album=${album}`;

function refresh() {
  revalidatePath("/", "layout");
}

/** A clash on the web address, shown under the field rather than as a toast. */
function slugTaken(title: string | null, slug: string): z.ZodError {
  const message = title
    ? `“${truncate(title, 60)}” already uses this web address. Add a word to make it unique, e.g. ${slug}-${isoDay().slice(0, 4)}.`
    : "Another article already uses this web address. Add a word to make it unique.";
  return new z.ZodError([{ code: "custom", path: ["slug"], message, input: slug }]);
}

/**
 * The stored moment for the date picked in the form (Accra time is UTC).
 * Keeping the same day keeps the exact time; today means now; any other day
 * starts at midnight, so a future-dated article appears as that day begins.
 */
function publishedAtFor(day: string | null | undefined, previous: string | null): string | null {
  if (!day) return null;
  if (previous && isoDay(previous) === day) return previous;
  if (day === isoDay()) return new Date().toISOString();
  return `${day}T00:00:00Z`;
}

const isFuture = (at: string | null) => Boolean(at && Date.parse(at) > Date.now());

function publishedSummary(title: string, at: string | null) {
  return isFuture(at) ? `scheduled “${truncate(title, 80)}” to appear on the website on ${formatDate(at)}` : `published “${truncate(title, 80)}” on the website`;
}

export async function saveArticle(input: ArticleInput): Promise<ActionResult<{ id: string; status: ArticleStatus }>> {
  return run(async () => {
    const { profile, role, supabase } = await requireCapability("website.write");
    const data = articleSchema.parse(input);
    const manager = can(role, "website.publish");
    if (data.publish && !manager) throw new ActionError("Only managers can publish. Save it as a draft and ask a manager to publish it.");

    let clashQuery = supabase.from("website_articles").select("id, title").eq("slug", data.slug);
    if (data.id) clashQuery = clashQuery.neq("id", data.id);
    const clash = check(await clashQuery.limit(1).maybeSingle());
    if (clash) throw slugTaken(clash.title, data.slug);

    const before = data.id
      ? one(await supabase.from("website_articles").select("title, slug, category, status, published_at").eq("id", data.id).single())
      : null;
    if (before?.status === "published" && !manager) throw new ActionError("Only managers can change a published article. Ask one to make the edit, or to unpublish it first.");

    const status: ArticleStatus = data.publish || before?.status === "published" ? "published" : "draft";
    const published_at = publishedAtFor(data.published_on, before?.published_at ?? null) ?? (status === "published" ? new Date().toISOString() : null);
    const values = {
      title: data.title,
      slug: data.slug,
      category: data.category,
      author: data.author ?? null,
      excerpt: data.excerpt ?? "",
      body: data.body.replace(/\r\n?/g, "\n"),
      cover_url: data.cover_url ?? null,
      cover_alt: data.cover_alt ?? "",
      status,
      published_at,
      updated_by: profile.id,
    };
    const actor = { id: profile.id, name: profile.full_name };
    const title = `“${truncate(data.title, 80)}”`;
    const address = articleUrl(data.slug, published_at);

    // ── Create ──────────────────────────────────────────────────────────────
    if (!before) {
      const inserted = await supabase.from("website_articles").insert({ ...values, created_by: profile.id }).select("id").single();
      if (inserted.error?.code === "23505") throw slugTaken(null, data.slug);
      const created = one(inserted);
      await recordEvent(status === "published" ? {
        actor,
        action: "website.article_published",
        category: "website",
        summary: publishedSummary(data.title, published_at),
        detail: data.excerpt ? truncate(data.excerpt, 220) : undefined,
        entity: { type: "website_article", id: created.id, label: data.title },
        link: link(created.id),
        importance: "high",
        tone: "good",
        facts: [{ label: "Category", value: data.category }, { label: "Dated", value: formatDate(published_at) }, { label: "Address", value: address }],
      } : {
        actor,
        action: "website.article_created",
        category: "website",
        summary: `drafted ${title} for the website`,
        entity: { type: "website_article", id: created.id, label: data.title },
        link: link(created.id),
        facts: [{ label: "Category", value: data.category }, ...(data.author ? [{ label: "Author", value: data.author }] : [])],
      });
      refresh();
      return { id: created.id, status };
    }

    // ── Update: describe what actually changed ──────────────────────────────
    const id = data.id!;
    const updated = await supabase.from("website_articles").update(values).eq("id", id);
    if (updated.error?.code === "23505") throw slugTaken(null, data.slug);
    check(updated);

    const facts: Fact[] = [];
    if (before.title !== data.title) facts.push({ label: "Title", value: `${truncate(before.title, 60)} → ${truncate(data.title, 60)}` });
    if (before.category !== data.category) facts.push({ label: "Category", value: `${before.category} → ${data.category}` });
    const oldAddress = articleUrl(before.slug, before.published_at);
    const moved = before.status === "published" && oldAddress !== address;
    if (moved) facts.push({ label: "Address", value: `${oldAddress} → ${address}` });

    const nowPublished = before.status === "draft" && status === "published";
    await recordEvent({
      actor,
      action: nowPublished ? "website.article_published" : "website.article_updated",
      category: "website",
      summary: nowPublished ? publishedSummary(data.title, published_at) : status === "published" ? `updated ${title} on the website` : `edited the draft ${title}`,
      detail: moved ? "Its web address changed, so links to the old address no longer work." : nowPublished && data.excerpt ? truncate(data.excerpt, 220) : undefined,
      entity: { type: "website_article", id, label: data.title },
      link: link(id),
      importance: nowPublished || moved ? "high" : status === "published" ? "normal" : "low",
      tone: nowPublished ? "good" : moved ? "warning" : "default",
      facts: nowPublished ? [{ label: "Category", value: data.category }, { label: "Dated", value: formatDate(published_at) }, { label: "Address", value: address }] : facts,
    });
    refresh();
    return { id, status };
  });
}

export async function publishArticle(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("website.publish");
    const row = one(await supabase.from("website_articles").select("title, slug, category, excerpt, status, published_at").eq("id", f.id.parse(id)).single());
    if (row.status === "published") return undefined;
    const published_at = row.published_at ?? new Date().toISOString();
    check(await supabase.from("website_articles").update({ status: "published", published_at, updated_by: profile.id }).eq("id", id));
    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: "website.article_published",
      category: "website",
      summary: publishedSummary(row.title, published_at),
      detail: row.excerpt ? truncate(row.excerpt, 220) : undefined,
      entity: { type: "website_article", id, label: row.title },
      link: link(id),
      importance: "high",
      tone: "good",
      facts: [{ label: "Category", value: row.category }, { label: "Dated", value: formatDate(published_at) }, { label: "Address", value: articleUrl(row.slug, published_at) }],
    });
    refresh();
    return undefined;
  }, "Article published");
}

export async function unpublishArticle(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("website.publish");
    const row = one(await supabase.from("website_articles").select("title, slug, status, published_at").eq("id", f.id.parse(id)).single());
    if (row.status === "draft") return undefined;
    // The date stays, so publishing again brings the article back at the same address.
    check(await supabase.from("website_articles").update({ status: "draft", updated_by: profile.id }).eq("id", id));
    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: "website.article_unpublished",
      category: "website",
      summary: `took “${truncate(row.title, 80)}” off the website`,
      detail: "It's a draft again and no longer shows on the website. Publishing it again brings it back at the same address.",
      entity: { type: "website_article", id, label: row.title },
      link: link(id),
      importance: "high",
      tone: "warning",
      facts: [{ label: "Address", value: articleUrl(row.slug, row.published_at) }],
    });
    refresh();
    return undefined;
  }, "Article unpublished — it's a draft again");
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("website.publish");
    const row = one(await supabase.from("website_articles").select("title, status").eq("id", f.id.parse(id)).single());
    const removed = check(await supabase.from("website_articles").delete().eq("id", id).select("id"));
    if (!removed?.length) throw new ActionError("That article could not be deleted. Only managers can delete articles.");
    const live = row.status === "published";
    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: "website.article_deleted",
      category: "website",
      summary: live ? `deleted “${truncate(row.title, 80)}” from the website` : `deleted the draft “${truncate(row.title, 80)}”`,
      link: "/website",
      audience: "managers",
      importance: live ? "high" : "normal",
      tone: "warning",
    });
    refresh();
    return undefined;
  }, "Article deleted");
}

// ── Gallery ───────────────────────────────────────────────────────────────────
const album = z.string().trim()
  .regex(ALBUM_PATTERN, "Use the edition's four-digit year, e.g. 2026.")
  .refine((v) => Number(v) >= 2024 && Number(v) <= 2100, "Albums are edition years, from 2024 on.");
const dimension = z.number().int().min(1).max(20_000).nullable().optional();

const addPhotosSchema = z.object({
  album,
  photos: z.array(z.object({ path: z.string().max(300), width: dimension, height: dimension, caption: f.optionalText(300) })).min(1, "Choose at least one photo.").max(100, "Add up to 100 photos at a time."),
});

export type AddPhotosInput = z.input<typeof addPhotosSchema>;

/** One call for a whole batch: the files are already in storage, this records them and tells the team once. */
export async function addGalleryPhotos(input: AddPhotosInput): Promise<ActionResult<{ count: number; album: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("website.write");
    const data = addPhotosSchema.parse(input);
    const folder = galleryFolder(data.album);
    if (data.photos.some((p) => !p.path.startsWith(folder) || !/^[a-z0-9/_-]+\.jpg$/i.test(p.path))) throw new ActionError("A photo was stored in the wrong place. Upload it again.");

    const last = check(await supabase.from("website_gallery_photos").select("sort_order").eq("album", data.album).order("sort_order", { ascending: false }).limit(1).maybeSingle());
    const start = (last?.sort_order ?? 0) + 1;
    const assets = supabase.storage.from("assets");
    check(await supabase.from("website_gallery_photos").insert(data.photos.map((p, i) => ({
      album: data.album,
      image_url: assets.getPublicUrl(p.path).data.publicUrl,
      width: p.width ?? null,
      height: p.height ?? null,
      caption: p.caption ?? "",
      sort_order: start + i,
      created_by: profile.id,
    }))));

    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: "website.gallery_photos_added",
      category: "website",
      summary: `added ${pluralize(data.photos.length, "photo")} to the ${data.album} gallery`,
      detail: "They appear on the website after the photos that ship with it.",
      link: galleryLink(data.album),
      facts: [{ label: "Album", value: data.album }, { label: "On the website", value: galleryUrl(data.album) }],
    });
    refresh();
    return { count: data.photos.length, album: data.album };
  });
}

export async function saveGalleryCaption(id: string, caption: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("website.write");
    const input = z.object({ id: f.id, caption: z.string().trim().max(300, "Keep the caption under 300 characters.") }).parse({ id, caption });
    const row = one(await supabase.from("website_gallery_photos").select("album, caption").eq("id", input.id).single());
    if (row.caption === input.caption) return undefined;
    check(await supabase.from("website_gallery_photos").update({ caption: input.caption }).eq("id", input.id));
    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: "website.gallery_photo_updated",
      category: "website",
      summary: input.caption ? `captioned a photo in the ${row.album} gallery` : `removed a photo's caption in the ${row.album} gallery`,
      detail: input.caption ? `“${truncate(input.caption, 120)}”` : undefined,
      entity: { type: "website_gallery_photo", id: input.id, label: input.caption || `${row.album} gallery photo` },
      link: galleryLink(row.album),
      importance: "low",
    });
    refresh();
    return undefined;
  }, "Caption saved");
}

export async function setGalleryPhotoVisibility(id: string, visible: boolean): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("website.write");
    const input = z.object({ id: f.id, visible: z.boolean() }).parse({ id, visible });
    const row = one(await supabase.from("website_gallery_photos").select("album, caption, is_published").eq("id", input.id).single());
    if (row.is_published === input.visible) return undefined;
    check(await supabase.from("website_gallery_photos").update({ is_published: input.visible }).eq("id", input.id));
    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: input.visible ? "website.gallery_photo_shown" : "website.gallery_photo_hidden",
      category: "website",
      summary: input.visible ? `put a hidden photo back in the ${row.album} gallery` : `hid a photo from the ${row.album} gallery`,
      detail: row.caption ? `“${truncate(row.caption, 120)}”` : undefined,
      entity: { type: "website_gallery_photo", id: input.id, label: row.caption || `${row.album} gallery photo` },
      link: galleryLink(row.album),
      importance: "low",
    });
    refresh();
    return undefined;
  });
}

export async function deleteGalleryPhoto(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, role, supabase } = await requireCapability("website.write");
    const row = one(await supabase.from("website_gallery_photos").select("album, caption, image_url, created_by").eq("id", f.id.parse(id)).single());
    if (row.created_by !== profile.id && !can(role, "website.publish")) throw new ActionError("Only the person who uploaded this photo, or a manager, can delete it.");
    const removed = check(await supabase.from("website_gallery_photos").delete().eq("id", id).select("id"));
    if (!removed?.length) throw new ActionError("Only the person who uploaded this photo, or a manager, can delete it.");

    // Our own uploads also leave storage; anything else (an outside link) is only forgotten.
    const marker = "/storage/v1/object/public/assets/";
    const at = row.image_url.indexOf(marker);
    const path = at >= 0 ? decodeURIComponent(row.image_url.slice(at + marker.length).split("?")[0]) : null;
    if (path?.startsWith("website/gallery/")) {
      const { error } = await supabase.storage.from("assets").remove([path]);
      if (error) console.error("[website] storage remove failed:", error.message);
    }

    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: "website.gallery_photo_deleted",
      category: "website",
      summary: `removed a photo from the ${row.album} gallery`,
      detail: row.caption ? `“${truncate(row.caption, 120)}”` : undefined,
      link: galleryLink(row.album),
      importance: "low",
      tone: "warning",
    });
    refresh();
    return undefined;
  }, "Photo deleted");
}
