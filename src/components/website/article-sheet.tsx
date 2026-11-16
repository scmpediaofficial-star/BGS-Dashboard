"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Globe, Lock, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { deleteArticle, saveArticle, unpublishArticle } from "@/app/(app)/website/actions";
import { useViewer } from "@/components/shell/session-context";
import { ImageUpload } from "@/components/shared/image-upload";
import { useAction } from "@/components/shared/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/form";
import { MarkdownEditor } from "@/components/website/markdown-editor";
import {
  ARTICLE_CATEGORIES, EXCERPT_MAX, EXCERPT_TARGET, SLUG_MAX, SLUG_PATTERN, WEBSITE_HOST,
  articleMeta, articlePath, articleState, articleUrl, slugify, websiteAsset, type Article, type ArticleCategory,
} from "@/components/website/types";
import { formatDate, isoDay, timeAgo, truncate } from "@/lib/utils";

type Props = {
  open: boolean;
  article: Article | null;
  /** Every article, to catch a web address that is already taken before saving. */
  articles: Article[];
  today: string;
  now: string;
  onClose: () => void;
};

type Form = {
  title: string;
  slug: string;
  category: ArticleCategory;
  author: string;
  excerpt: string;
  cover_url: string | null;
  cover_alt: string;
  published_on: string;
  body: string;
};

type Confirm = "publish" | "unpublish" | "delete" | "discard";

const noon = (day: string) => (day ? `${day}T12:00:00Z` : null);

/** Write, edit or (for viewers) read a news article, and publish it when a manager is happy with it. */
export function ArticleSheet({ open, article, articles, today, now, onClose }: Props) {
  const { can } = useViewer();
  const isNew = !article;
  const canPublish = can("website.publish");
  const live = article?.status === "published";
  // Row-level security agrees: contributors edit drafts, managers edit everything.
  const editable = can("website.write") && (!live || canPublish);

  const initial = useMemo<Form>(() => ({
    title: article?.title ?? "",
    slug: article?.slug ?? "",
    category: ARTICLE_CATEGORIES.find((c) => c === article?.category) ?? "Summit News",
    author: article?.author ?? "",
    excerpt: article?.excerpt ?? "",
    cover_url: article?.cover_url ?? null,
    cover_alt: article?.cover_alt ?? "",
    published_on: article ? (article.published_at ? isoDay(article.published_at) : "") : today,
    body: article?.body ?? "",
  }), [article, today]);

  const [form, setForm] = useState<Form>(initial);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [slugBlurred, setSlugBlurred] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [intent, setIntent] = useState<"save" | "publish">("save");

  const set = (patch: Partial<Form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !(key in patch))));
  };

  const dirty = (Object.keys(initial) as (keyof Form)[]).some((key) => initial[key] !== form[key]);
  const future = Boolean(form.published_on && form.published_on > today);

  // ── The web address ────────────────────────────────────────────────────────
  const clash = form.slug ? articles.find((a) => a.slug === form.slug && a.id !== article?.id) : undefined;
  const slugProblem = !form.slug
    ? "Give the article a web address."
    : !SLUG_PATTERN.test(form.slug)
      ? "Use lowercase letters, numbers and single hyphens, with no hyphen at either end."
      : clash
        ? `“${truncate(clash.title, 60)}” already uses this web address. Add a word to make it unique, e.g. ${form.slug}-${today.slice(0, 4)}.`
        : null;
  const slugError = errors.slug ?? (clash || slugBlurred ? slugProblem : null);
  const path = articlePath(form.slug || "web-address", noon(form.published_on));
  const addressMoved = live && (form.slug !== article.slug || form.published_on !== (article.published_at ? isoDay(article.published_at) : ""));

  const excerptHint = form.excerpt
    ? `${form.excerpt.length} of about ${EXCERPT_TARGET} characters${form.excerpt.length > EXCERPT_TARGET ? ". News cards may cut it short." : "."}`
    : `A sentence or two for news cards and link previews, about ${EXCERPT_TARGET} characters.`;

  const [save, saving] = useAction(saveArticle, {
    success: (r) => (r.status === "draft" ? "Draft saved" : live ? (future ? "Changes saved" : "Changes are live on the website") : future ? "Article scheduled" : "Article published"),
    onSuccess: onClose,
  });
  const [unpublish, unpublishing] = useAction(unpublishArticle, { onSuccess: () => setConfirm(null) });
  const [remove, removing] = useAction(deleteArticle, { onSuccess: onClose });

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Give the article a title.";
    if (slugProblem) next.slug = slugProblem;
    setErrors(next);
    setSlugBlurred(true);
    if (Object.keys(next).length) document.getElementById(next.title ? "a-title" : "a-slug")?.focus();
    return !Object.keys(next).length;
  }

  async function submit(publish: boolean) {
    if (!validate()) return setConfirm(null);
    setIntent(publish ? "publish" : "save");
    const result = await save({ id: article?.id, ...form, cover_url: form.cover_url ?? "", publish });
    setConfirm(null);
    if (!result.ok) setErrors(result.fieldErrors ?? {});
  }

  function requestClose() {
    if (editable && dirty && !saving) setConfirm("discard");
    else onClose();
  }

  const meta = article ? articleMeta(article, now) : null;
  const formId = "article-form";

  const confirmCopy: Record<Confirm, { title: string; description: string; label: string; destructive?: boolean; loading?: boolean; run: () => void }> = {
    publish: {
      title: future ? "Schedule this article?" : "Publish this article?",
      description: `${future ? `It will appear on the website on ${formatDate(form.published_on)}` : "It goes live on the website straight away"}, at ${WEBSITE_HOST}${path}. The team is told.`,
      label: future ? "Schedule" : "Publish",
      loading: saving && intent === "publish",
      run: () => void submit(true),
    },
    unpublish: {
      title: "Take this article off the website?",
      description: "It becomes a draft again and disappears from the website. Links to it stop working until it is published again.",
      label: "Unpublish",
      destructive: true,
      loading: unpublishing,
      run: () => article && unpublish(article.id),
    },
    delete: {
      title: "Delete this article?",
      description: `“${truncate(article?.title ?? "", 80)}” will be removed for everyone${live ? " and taken off the website" : ""}. This can't be undone.`,
      label: "Delete",
      destructive: true,
      loading: removing,
      run: () => article && remove(article.id),
    },
    discard: {
      title: "Discard your changes?",
      description: "Some edits to this article haven't been saved. Close it anyway and lose them?",
      label: "Discard changes",
      destructive: true,
      run: () => { setConfirm(null); onClose(); },
    },
  };
  const dialog = confirm ? confirmCopy[confirm] : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
      <SheetContent
        className="sm:max-w-3xl"
        title={isNew ? "New article" : article.title}
        description={isNew
          ? "It stays a draft in the dashboard until a manager publishes it."
          : `Updated ${timeAgo(article.updated_at)}${article.editor ? ` by ${article.editor.full_name}` : ""}${article.creator ? ` · written by ${article.creator.full_name}` : ""}`}
        footer={
          editable ? (
            <>
              {!isNew && canPublish && (
                <Button type="button" variant="danger-ghost" className="mr-auto" onClick={() => setConfirm("delete")}><Trash2 /> Delete</Button>
              )}
              <Button type="button" variant="outline" onClick={requestClose}>Cancel</Button>
              {live ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setConfirm("unpublish")}><Undo2 /> Unpublish</Button>
                  <Button type="submit" form={formId} loading={saving}>Save changes</Button>
                </>
              ) : (
                <>
                  <Button type="submit" form={formId} variant={canPublish ? "outline" : "primary"} loading={saving && intent === "save"}>Save draft</Button>
                  {canPublish && (
                    <Button type="button" onClick={() => validate() && setConfirm("publish")}><Globe /> {future ? "Schedule" : isNew ? "Publish now" : "Publish"}</Button>
                  )}
                </>
              )}
            </>
          ) : (
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          )
        }
      >
        {article && meta && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone} icon={meta.icon}>{articleState(article, now) === "scheduled" ? `Scheduled for ${formatDate(article.published_at)}` : meta.label}</Badge>
            <Badge tone="neutral">{article.category}</Badge>
            {!editable && <Badge tone="neutral" icon={Lock}>Read only</Badge>}
            {articleState(article, now) === "published" && (
              <Button asChild variant="outline" size="sm" className="ml-auto">
                <a href={articleUrl(article.slug, article.published_at)} target="_blank" rel="noopener noreferrer"><ExternalLink /> View on website</a>
              </Button>
            )}
          </div>
        )}
        {live && !editable && can("website.write") && (
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink-2">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
            This article is live. Only managers can change it: ask one to make the edit, or to unpublish it so you can work on it as a draft.
          </p>
        )}

        <form id={formId} onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="grid gap-4">
          <fieldset disabled={!editable} className="grid gap-4 disabled:opacity-100">
            <Field label="Title" htmlFor="a-title" error={errors.title}>
              <Input
                id="a-title"
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value;
                  set(slugTouched ? { title } : { title, slug: slugify(title) });
                }}
                required
                maxLength={200}
                placeholder="e.g. BGS 2026 opens at the Labadi Beach Hotel"
                autoFocus={isNew}
                aria-invalid={Boolean(errors.title)}
              />
            </Field>

            <div className="grid gap-1.5">
              <Field label="Web address" htmlFor="a-slug" error={slugError} hint={`${WEBSITE_HOST}${path}${isNew && !slugTouched ? " · follows the title until you edit it" : ""}`}>
                <div className="flex gap-2">
                  <Input
                    id="a-slug"
                    value={form.slug}
                    onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }); }}
                    onBlur={() => { setSlugBlurred(true); const tidy = slugify(form.slug); if (tidy && tidy !== form.slug) set({ slug: tidy }); }}
                    maxLength={SLUG_MAX}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="made-from-the-title"
                    aria-invalid={Boolean(slugError)}
                    className="font-mono text-[12.5px]"
                  />
                  {editable && !live && slugTouched && form.title && slugify(form.title) !== form.slug && (
                    <Button type="button" variant="outline" onClick={() => { setSlugTouched(false); set({ slug: slugify(form.title) }); }} aria-label="Make the web address match the title">
                      <RotateCcw /> <span className="max-sm:sr-only">Match title</span>
                    </Button>
                  )}
                </div>
              </Field>
              {addressMoved && <p className="text-xs font-medium text-warning-ink">This article is live: a new address or date breaks links that were already shared.</p>}
            </div>

            <div className="grid items-start gap-4 sm:grid-cols-3">
              <Field label="Category" htmlFor="a-category">
                <Select id="a-category" value={form.category} onChange={(e) => set({ category: e.target.value as ArticleCategory })}>
                  {ARTICLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Date" htmlFor="a-date" optional={!live} error={errors.published_on} hint={form.published_on ? (future ? "The website shows it from that day." : "Shown on the article and in its address.") : "Empty: the day it's published."}>
                <Input id="a-date" type="date" value={form.published_on} onChange={(e) => set({ published_on: e.target.value })} required={live} aria-invalid={Boolean(errors.published_on)} />
              </Field>
              <Field label="Author" htmlFor="a-author" optional error={errors.author}>
                <Input id="a-author" value={form.author} onChange={(e) => set({ author: e.target.value })} maxLength={120} placeholder="e.g. BGS Secretariat" />
              </Field>
            </div>

            <Field label="Excerpt" htmlFor="a-excerpt" optional error={errors.excerpt} hint={excerptHint}>
              <Textarea id="a-excerpt" value={form.excerpt} onChange={(e) => set({ excerpt: e.target.value })} maxLength={EXCERPT_MAX} rows={3} className="min-h-20" placeholder="What happened, in a sentence or two." aria-invalid={Boolean(errors.excerpt)} />
            </Field>

            <div className="grid gap-4 rounded-xl border border-line p-3.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <ImageUpload
                value={websiteAsset(form.cover_url)}
                onChange={(url) => set({ cover_url: url })}
                folder="website"
                label="Cover image"
                disabled={!editable}
              />
              <Field
                label="Cover description"
                htmlFor="a-cover-alt"
                optional
                error={errors.cover_alt ?? errors.cover_url}
                hint={form.cover_url && !form.cover_alt.trim() ? "Describe the picture for people using screen readers." : "For screen readers, e.g. “Delegates at the opening session of BGS 2026”."}
              >
                <Input id="a-cover-alt" value={form.cover_alt} onChange={(e) => set({ cover_alt: e.target.value })} maxLength={300} disabled={!form.cover_url && !form.cover_alt} placeholder={form.cover_url ? "What the picture shows" : "Add a cover image first"} />
              </Field>
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="a-body">Article</Label>
            <MarkdownEditor id="a-body" value={form.body} onChange={(body) => set({ body })} disabled={!editable} invalid={Boolean(errors.body)} />
            {errors.body && <p role="alert" className="text-xs font-medium text-critical-ink">{errors.body}</p>}
          </div>
        </form>
      </SheetContent>

      <ConfirmDialog
        open={Boolean(dialog)}
        onOpenChange={(next) => !next && setConfirm(null)}
        title={dialog?.title ?? ""}
        description={dialog?.description ?? ""}
        confirmLabel={dialog?.label}
        destructive={dialog?.destructive}
        loading={dialog?.loading}
        onConfirm={() => dialog?.run()}
      />
    </Dialog>
  );
}
