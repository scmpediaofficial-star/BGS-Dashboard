import { ARTICLE_SCHEDULED, ARTICLE_STATUS, type ArticleStatus, type Meta } from "@/lib/domain";

/** The four sections of the website's news page, in its own order. */
export const ARTICLE_CATEGORIES = ["Announcements", "Speeches", "Insights", "Summit News"] as const;
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

/** Same rule as the database: lowercase words joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX = 120;
/** The excerpt shows on news cards and in link previews; about 200 characters reads well in both. */
export const EXCERPT_TARGET = 200;
export const EXCERPT_MAX = 600;
export const BODY_MAX = 100_000;

/** Edition years the website already has a gallery section for. */
export const DEFAULT_ALBUMS = ["2024", "2025", "2026"];
export const ALBUM_PATTERN = /^\d{4}$/;

export type Article = {
  id: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  body: string;
  cover_url: string | null;
  cover_alt: string;
  author: string | null;
  status: ArticleStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  creator: { full_name: string } | null;
  editor: { full_name: string } | null;
};

export type GalleryPhoto = {
  id: string;
  album: string;
  image_url: string;
  width: number | null;
  height: number | null;
  caption: string;
  sort_order: number;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  uploader: { full_name: string } | null;
};

/** The public website, without a trailing slash. */
export const WEBSITE_URL = (process.env.NEXT_PUBLIC_WEBSITE_URL?.trim() || "https://boardroomgovsummit.com").replace(/\/+$/, "");
export const WEBSITE_HOST = WEBSITE_URL.replace(/^https?:\/\//, "");

/** Images stored with the website itself are saved as paths (`/media/news/x.jpg`): show them from the website. */
export function websiteAsset(url: string): string;
export function websiteAsset(url: string | null | undefined): string | null;
export function websiteAsset(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/") && !url.startsWith("//") ? `${WEBSITE_URL}${url}` : url;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `/YYYY/MM/DD/<slug>/`, the WordPress-era permalink the website keeps. Accra time is UTC, so the UTC date is the date shown. */
export function articlePath(slug: string, publishedAt: string | null | undefined): string {
  const date = publishedAt ? new Date(publishedAt) : null;
  if (!date || Number.isNaN(date.getTime())) return `/YYYY/MM/DD/${slug}/`;
  return `/${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${slug}/`;
}

export function articleUrl(slug: string, publishedAt: string | null | undefined): string {
  return `${WEBSITE_URL}${articlePath(slug, publishedAt)}`;
}

/** An edition's gallery page on the website. 2024 kept the original site's /gallery/ address; later years are /<year>-gallery/. */
export function galleryUrl(album: string): string {
  return album === "2024" ? `${WEBSITE_URL}/gallery/` : `${WEBSITE_URL}/${album}-gallery/`;
}

/** “Speech: The Board’s Duty — 2026!” → `speech-the-boards-duty-2026` */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= 80) return slug;
  const cut = slug.slice(0, 80);
  return (cut.includes("-") ? cut.slice(0, cut.lastIndexOf("-")) : cut).replace(/-+$/, "");
}

export type ArticleState = "draft" | "scheduled" | "published";

/** Published with a date still to come = held back by the website until then. */
export function articleState(article: Pick<Article, "status" | "published_at">, now: string): ArticleState {
  if (article.status !== "published") return "draft";
  // Compare instants, not strings: Postgres writes `+00:00` where JavaScript writes `Z`.
  return article.published_at && Date.parse(article.published_at) > Date.parse(now) ? "scheduled" : "published";
}

export function articleMeta(article: Pick<Article, "status" | "published_at">, now: string): Meta {
  const state = articleState(article, now);
  return state === "scheduled" ? ARTICLE_SCHEDULED : ARTICLE_STATUS[state];
}

/** Where the gallery's own uploads live in the public `assets` bucket. */
export const galleryFolder = (album: string) => `website/gallery/${album}/`;
export const ARTICLE_IMAGE_FOLDER = "website/articles/";
