"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CalendarClock, CircleAlert, CircleCheck, ExternalLink, FileText, Hash, ImagePlus, Link2, LoaderCircle, RotateCcw, Rocket, Save, Send, SlidersHorizontal, Sparkles, Trash2, Undo2, X,
} from "lucide-react";
import { approvePost, deletePost, publishNow, rejectPost, savePost, type PostInput } from "@/app/(app)/social/actions";
import { BrandIcon } from "@/components/social/brand-icon";
import { MediaLibrary, type MediaItem } from "@/components/social/media-library";
import { useViewer } from "@/components/shell/session-context";
import { Comments } from "@/components/shared/comments";
import { useAction } from "@/components/shared/use-action";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { SOCIAL_POST_STATUS, type SocialPostStatus } from "@/lib/domain";
import { PROVIDERS, countChars, fillVariables, isProviderId, validateForProvider, type ProviderId } from "@/lib/social/catalog";
import { cn, formatDateTime } from "@/lib/utils";

type Account = { id: string; provider: string; display_name: string; username: string | null; avatar_url: string | null; status: string };
type Target = { id: string; account_id: string; content_override: string | null; options: unknown; status: string; external_url: string | null; error: string | null; published_at: string | null };
type Post = {
  id: string; content: string; link_url: string | null; campaign: string | null; notes: string | null; tags: string[]; media_ids: string[]; status: SocialPostStatus;
  scheduled_at: string | null; published_at: string | null; rejection_note: string | null; author_id: string | null;
  author: { full_name: string } | null; approver: { full_name: string } | null; targets: Target[];
};
type Queue = { timezone: string; slots: string[]; days: number[] };

type Props = {
  post: Post | null; accounts: Account[]; media: MediaItem[]; templates: { id: string; name: string; content: string }[];
  hashtagGroups: { id: string; name: string; hashtags: string }[]; taken: string[]; queue: Queue; startDay: string | null; variables: Record<string, string | number>;
};

const asRecord = (v: unknown): Record<string, string | boolean | number | null> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string | boolean | number | null>) : {});

/** ISO instant → value for <input type="datetime-local"> in the viewer's own timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** The next posting slot (queue times are Accra = GMT) that is in the future and not already taken. */
function nextSlot(queue: Queue, taken: string[], from = Date.now()): string | null {
  const used = new Set(taken.map((t) => new Date(t).toISOString().slice(0, 16)));
  for (let day = 0; day < 21; day++) {
    const base = new Date(from + day * 86_400_000);
    if (!queue.days.includes(base.getUTCDay())) continue;
    for (const slot of [...queue.slots].sort()) {
      const [h, m] = slot.split(":").map(Number);
      const at = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h, m);
      if (at > from + 5 * 60_000 && !used.has(new Date(at).toISOString().slice(0, 16))) return new Date(at).toISOString();
    }
  }
  return null;
}

export function Composer({ post, accounts, media, templates, hashtagGroups, taken, queue, startDay, variables }: Props) {
  const { viewer, can } = useViewer();
  const router = useRouter();
  const manager = can("social.publish");
  const status: SocialPostStatus = post?.status ?? "draft";
  const mine = !post || post.author_id === viewer.id;
  const editable = can("social.draft") && (["draft", "pending_approval"].includes(status) ? mine || manager : manager && ["scheduled", "failed", "partial"].includes(status));

  const [content, setContent] = useState(post?.content ?? "");
  const [link, setLink] = useState(post?.link_url ?? "");
  const [campaign, setCampaign] = useState(post?.campaign ?? "");
  const [notes, setNotes] = useState(post?.notes ?? "");
  const [tags, setTags] = useState((post?.tags ?? []).join(", "));
  const [mediaIds, setMediaIds] = useState<string[]>(post?.media_ids ?? []);
  const [selected, setSelected] = useState<string[]>(post?.targets.map((t) => t.account_id) ?? []);
  const [overrides, setOverrides] = useState<Record<string, string>>(Object.fromEntries((post?.targets ?? []).filter((t) => t.content_override !== null).map((t) => [t.account_id, t.content_override!])));
  const [options, setOptions] = useState<Record<string, Record<string, string | boolean | number | null>>>(Object.fromEntries((post?.targets ?? []).map((t) => [t.account_id, asRecord(t.options)])));
  const [when, setWhen] = useState(toLocalInput(post?.scheduled_at ?? (startDay ? `${startDay}T${queue.slots[0] ?? "09:00"}:00Z` : null)));
  const [tab, setTab] = useState<string>("all");
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [returning, setReturning] = useState(false);
  const [returnNote, setReturnNote] = useState("");

  const usable = accounts.filter((a) => a.status === "active" && isProviderId(a.provider));
  const chosen = usable.filter((a) => selected.includes(a.id));
  const attached = mediaIds.map((id) => media.find((m) => m.id === id)).filter((m): m is MediaItem => Boolean(m));
  const textFor = (accountId: string) => overrides[accountId] ?? content;
  const current = tab === "all" ? null : chosen.find((a) => a.id === tab) ?? null;
  const editorText = current ? textFor(current.id) : content;

  // Cheap enough to recompute on every keystroke — and that keeps it honest.
  const checks = chosen.map((account) => {
    const provider = account.provider as ProviderId;
    const full = [overrides[account.id] ?? content, link].filter(Boolean).join("\n\n");
    return { account, provider, chars: countChars(provider, full), problem: validateForProvider(provider, full, attached) };
  });
  const blocked = checks.some((c) => c.problem);

  function setEditorText(value: string) {
    if (current) setOverrides((o) => ({ ...o, [current.id]: value }));
    else setContent(value);
  }
  const insert = (snippet: string) => setEditorText(editorText ? `${editorText.replace(/\s+$/, "")}\n\n${snippet}` : snippet);
  const setOption = (accountId: string, key: string, value: string) => setOptions((o) => ({ ...o, [accountId]: { ...o[accountId], [key]: value || null } }));

  const payload = (mode: PostInput["mode"]): PostInput => ({
    id: post?.id, content, link_url: link, campaign, notes, mode,
    tags: tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean), media_ids: mediaIds,
    targets: chosen.map((a) => ({ account_id: a.id, content_override: overrides[a.id] ?? null, options: options[a.id] ?? {} })),
    scheduled_at: when ? new Date(when).toISOString() : null,
  });

  const [save, saving] = useAction(savePost, {
    silent: true,
    onSuccess: (data) => { if (!post) router.replace(`/social/compose?post=${data.id}`); },
  });
  const [approve, approving] = useAction(approvePost, { onSuccess: () => router.push("/social?tab=queue") });
  const [reject, rejecting] = useAction(rejectPost, { onSuccess: () => router.push("/social?tab=approvals") });
  const [retry, retrying] = useAction(publishNow, { silent: true });
  const [remove, removing] = useAction(deletePost, { success: "Post deleted", onSuccess: () => router.push("/social") });

  async function submit(mode: NonNullable<PostInput["mode"]>) {
    const result = await save(payload(mode));
    if (!result.ok) return;
    const { toast } = await import("sonner");
    if (mode === "publish") {
      const { published = 0, failed = 0, pending = 0 } = result.data;
      if (failed) toast.error(`${failed} channel${failed === 1 ? "" : "s"} failed${published ? `, ${published} published` : ""}. See the reasons below.`);
      else if (pending) toast.success("Sent. The network is still processing the media — it will finish on its own.");
      else toast.success(`Published to ${published} channel${published === 1 ? "" : "s"}.`);
      router.replace(`/social/compose?post=${result.data.id}`);
    } else {
      toast.success(mode === "draft" ? "Draft saved" : mode === "submit" ? "Sent for approval — managers have been alerted" : `Scheduled for ${formatDateTime(when ? new Date(when).toISOString() : null)}`);
      if (mode !== "draft") router.push(mode === "submit" ? "/social?tab=approvals" : "/social?tab=queue");
    }
  }

  const meta = SOCIAL_POST_STATUS[status];
  const previewAccount = current ?? chosen[0] ?? null;
  const previewProvider = (previewAccount?.provider ?? "linkedin") as ProviderId;
  const busy = saving || approving || rejecting || retrying;

  return (
    <>
      <PageHeader
        eyebrow="Social Studio"
        title={post ? (editable ? "Edit post" : "Post") : "Compose"}
        description={post ? `${post.author?.full_name ? `By ${post.author.full_name}` : "Post"}${post.approver?.full_name ? ` · approved by ${post.approver.full_name}` : ""}` : "Write once, tailor per network, then schedule it or send it for approval."}
        actions={<><Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge><Button asChild variant="outline"><Link href="/social"><ArrowLeft /> Calendar</Link></Button></>}
      />

      {post?.rejection_note && status === "draft" && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-[13px] text-warning-ink">
          <Undo2 className="mt-0.5 size-4.5 shrink-0" aria-hidden />
          <p><strong className="font-bold">Returned for changes:</strong> {post.rejection_note}</p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid gap-5">
          {/* 1 · Channels */}
          <Card>
            <CardHeader title="Channels" description={chosen.length ? `${chosen.length} selected` : "Where should this go?"} action={can("social.accounts") ? <Button asChild variant="ghost" size="sm"><Link href="/social/accounts">Manage</Link></Button> : undefined} />
            <CardBody>
              {usable.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-ink-3">
                  No channels are connected yet. {can("social.accounts") ? <Link href="/social/accounts" className="font-semibold text-accent-ink hover:underline">Connect one</Link> : "Ask an administrator to connect one."} You can still write and save drafts.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {usable.map((account) => {
                    const on = selected.includes(account.id);
                    const sent = post?.targets.find((t) => t.account_id === account.id)?.status === "published";
                    return (
                      <li key={account.id}>
                        <button
                          type="button" disabled={!editable || sent} aria-pressed={on}
                          onClick={() => { setSelected((s) => (on ? s.filter((id) => id !== account.id) : [...s, account.id])); if (on && tab === account.id) setTab("all"); }}
                          className={cn("flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[12.5px] font-semibold transition-colors disabled:opacity-70", on ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong bg-surface text-ink-2 hover:border-ink-3")}
                        >
                          <span className="relative"><Avatar name={account.display_name} src={account.avatar_url} size="sm" /><BrandIcon provider={account.provider as ProviderId} size="xs" className="absolute -bottom-1 -right-1 !size-4 ring-2 ring-surface" /></span>
                          <span className="max-w-40 truncate">{account.display_name}</span>
                          {sent && <CircleCheck className="size-3.5 text-good-ink" aria-label="Already published" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* 2 · Copy */}
          <Card>
            <CardHeader
              title="Post"
              action={editable ? (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><FileText /> Templates</Button></DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64">
                      <DropdownMenuLabel>Insert a template</DropdownMenuLabel>
                      {templates.length === 0 && <p className="px-2.5 py-2 text-xs text-ink-3">No templates yet.</p>}
                      {templates.map((t) => <DropdownMenuItem key={t.id} onSelect={() => insert(fillVariables(t.content, variables))}>{t.name}</DropdownMenuItem>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Hash /> Hashtags</Button></DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64">
                      <DropdownMenuLabel>Add a hashtag set</DropdownMenuLabel>
                      {hashtagGroups.map((g) => <DropdownMenuItem key={g.id} onSelect={() => insert(g.hashtags)}><span className="min-w-0"><span className="block">{g.name}</span><span className="block truncate text-[11px] font-normal text-ink-3">{g.hashtags}</span></span></DropdownMenuItem>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : undefined}
            />
            <CardBody className="grid gap-4">
              {chosen.length > 0 && (
                <div role="tablist" aria-label="Text per channel" className="scroll-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
                  <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold", tab === "all" ? "bg-primary text-primary-fg dark:bg-accent dark:text-accent-fg" : "bg-surface-3 text-ink-2")}>All channels</button>
                  {chosen.map((a) => (
                    <button key={a.id} type="button" role="tab" aria-selected={tab === a.id} onClick={() => setTab(a.id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold", tab === a.id ? "bg-primary text-primary-fg dark:bg-accent dark:text-accent-fg" : "bg-surface-3 text-ink-2")}>
                      <BrandIcon provider={a.provider as ProviderId} size="xs" /> <span className="max-w-28 truncate">{a.display_name}</span>
                      {overrides[a.id] !== undefined && <span className="size-1.5 rounded-full bg-gold" aria-label="Customised" />}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <Textarea
                  value={editorText} onChange={(e) => setEditorText(e.target.value)} disabled={!editable} maxLength={10000} rows={9}
                  aria-label={current ? `Text for ${current.display_name}` : "Post text"}
                  placeholder={current ? `Text for ${current.display_name} only…` : "What's the story? Use {{days}} for the countdown."}
                  className="min-h-48 text-[14px] leading-relaxed"
                />
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                  <span>
                    {current ? (
                      overrides[current.id] !== undefined
                        ? <button type="button" disabled={!editable} onClick={() => setOverrides(({ [current.id]: _drop, ...rest }) => rest)} className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline"><RotateCcw className="size-3" /> Use the shared text again</button>
                        : <>Typing here customises the text for <strong className="text-ink-2">{current.display_name}</strong> only.</>
                    ) : <>Variables: {["{{days}}", "{{event}}", "{{date}}", "{{venue}}", "{{website}}"].map((v) => <button key={v} type="button" disabled={!editable} onClick={() => insert(fillVariables(v, variables))} className="mr-1.5 rounded bg-surface-3 px-1 font-mono text-[10.5px] text-ink-2 hover:text-accent-ink">{v}</button>)}</>}
                  </span>
                  <span className="tabular">{[...editorText].length.toLocaleString("en-GB")} characters</span>
                </div>
              </div>

              <Field label="Link" htmlFor="post-link" optional hint="Becomes a link card where the network supports one; otherwise it's added after the text.">
                <div className="relative"><Link2 aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input id="post-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} disabled={!editable} placeholder="https://boardroomgovsummit.com/…" className="pl-9" /></div>
              </Field>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[12.5px] font-semibold text-ink-2">Media {attached.length > 0 && <span className="font-normal text-ink-3">· {attached.length} attached, in this order</span>}</p>
                  {editable && <Button type="button" variant="outline" size="sm" onClick={() => setPicker(true)}><ImagePlus /> {attached.length ? "Change" : "Add media"}</Button>}
                </div>
                {attached.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {attached.map((m) => (
                      <li key={m.id} className="relative size-20 overflow-hidden rounded-xl border border-line bg-surface-3">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage host varies per project */}
                        {m.mime_type.startsWith("video/") ? <video src={`${m.url}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" /> : <img src={m.jpeg_url ?? m.url} alt={m.alt_text ?? ""} className="size-full object-cover" />}
                        {editable && <button type="button" onClick={() => setMediaIds((ids) => ids.filter((id) => id !== m.id))} aria-label={`Remove ${m.file_name}`} className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/65 text-white"><X className="size-3" /></button>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>

          {/* 3 · Network-specific options */}
          {chosen.some((a) => ["wordpress", "tiktok", "linkedin"].includes(a.provider)) && (
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-ink-3" aria-hidden /> Network options</span>} />
              <CardBody className="grid gap-5">
                {chosen.map((a) => {
                  const o = options[a.id] ?? {};
                  if (a.provider === "wordpress") return (
                    <fieldset key={a.id} disabled={!editable} className="grid gap-3 sm:grid-cols-[1fr_180px]">
                      <legend className="mb-2 flex items-center gap-2 text-[13px] font-bold text-ink"><BrandIcon provider="wordpress" size="xs" /> {a.display_name}</legend>
                      <Field label="Headline" htmlFor={`wp-title-${a.id}`} hint="Left empty, the first line of the text becomes the headline."><Input id={`wp-title-${a.id}`} value={String(o.title ?? "")} onChange={(e) => setOption(a.id, "title", e.target.value)} maxLength={140} /></Field>
                      <Field label="Publish as" htmlFor={`wp-status-${a.id}`}><Select id={`wp-status-${a.id}`} value={String(o.wp_status ?? "publish")} onChange={(e) => setOption(a.id, "wp_status", e.target.value)}><option value="publish">Live news post</option><option value="draft">WordPress draft</option></Select></Field>
                    </fieldset>
                  );
                  if (a.provider === "tiktok") return (
                    <fieldset key={a.id} disabled={!editable} className="grid gap-3 sm:grid-cols-2">
                      <legend className="mb-2 flex items-center gap-2 text-[13px] font-bold text-ink"><BrandIcon provider="tiktok" size="xs" /> {a.display_name}</legend>
                      <Field label="Delivery" htmlFor={`tt-mode-${a.id}`} hint="Inbox works immediately: finish the post in the TikTok app, where you can add sound."><Select id={`tt-mode-${a.id}`} value={String(o.tiktok_mode ?? "inbox")} onChange={(e) => setOption(a.id, "tiktok_mode", e.target.value)}><option value="inbox">Send to TikTok inbox</option><option value="direct">Publish directly (audited apps)</option></Select></Field>
                      {o.tiktok_mode === "direct" && <Field label="Who can see it" htmlFor={`tt-priv-${a.id}`}><Select id={`tt-priv-${a.id}`} value={String(o.tiktok_privacy ?? "PUBLIC_TO_EVERYONE")} onChange={(e) => setOption(a.id, "tiktok_privacy", e.target.value)}><option value="PUBLIC_TO_EVERYONE">Everyone</option><option value="MUTUAL_FOLLOW_FRIENDS">Friends</option><option value="SELF_ONLY">Only me</option></Select></Field>}
                    </fieldset>
                  );
                  if (a.provider === "linkedin" && link && !attached.length) return (
                    <fieldset key={a.id} disabled={!editable}>
                      <legend className="mb-2 flex items-center gap-2 text-[13px] font-bold text-ink"><BrandIcon provider="linkedin" size="xs" /> {a.display_name}</legend>
                      <Field label="Link card title" htmlFor={`li-title-${a.id}`} hint="LinkedIn doesn't read the page for posts made through its API, so the card's title comes from here."><Input id={`li-title-${a.id}`} value={String(o.link_title ?? "")} onChange={(e) => setOption(a.id, "link_title", e.target.value)} maxLength={120} /></Field>
                    </fieldset>
                  );
                  return null;
                })}
              </CardBody>
            </Card>
          )}

          {/* 4 · Planning details */}
          <Card>
            <CardHeader title="Planning" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Campaign" htmlFor="post-campaign" optional><Input id="post-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} disabled={!editable} maxLength={160} placeholder="e.g. Panelist announcements" /></Field>
              <Field label="Tags" htmlFor="post-tags" optional hint="Comma-separated, for finding posts later."><Input id="post-tags" value={tags} onChange={(e) => setTags(e.target.value)} disabled={!editable} placeholder="panel-1, countdown" /></Field>
              <Field label="Internal notes" htmlFor="post-notes" optional className="sm:col-span-2" hint="Never published."><Textarea id="post-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable} maxLength={3000} className="min-h-16" /></Field>
            </CardBody>
          </Card>

          {post && <Card><CardBody className="pt-5"><Comments entityType="social_post" entityId={post.id} entityLabel={post.content.slice(0, 80) || "Media post"} link={`/social/compose?post=${post.id}`} /></CardBody></Card>}
        </div>

        {/* ── Right rail ─────────────────────────────────────────────────── */}
        <div className="grid content-start gap-5 xl:sticky xl:top-24">
          {/* Delivery results for posts that have been sent */}
          {post && post.targets.some((t) => t.status !== "pending") && (
            <Card>
              <CardHeader title="Delivery" description={post.published_at ? `Sent ${formatDateTime(post.published_at)}` : undefined} />
              <CardBody>
                <ul className="grid gap-2.5">
                  {post.targets.map((t) => {
                    const a = accounts.find((x) => x.id === t.account_id);
                    const tone = t.status === "published" ? "good" : t.status === "failed" ? "critical" : t.status === "publishing" ? "accent" : "neutral";
                    const Icon = t.status === "published" ? CircleCheck : t.status === "failed" ? CircleAlert : t.status === "publishing" ? LoaderCircle : CalendarClock;
                    return (
                      <li key={t.id} className="rounded-xl border border-line p-3">
                        <div className="flex items-center gap-2">
                          {a && isProviderId(a.provider) && <BrandIcon provider={a.provider} size="sm" />}
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{a?.display_name ?? "Removed channel"}</span>
                          <Badge tone={tone} icon={Icon} size="sm">{t.status === "publishing" ? "Processing" : t.status[0].toUpperCase() + t.status.slice(1)}</Badge>
                        </div>
                        {t.error && <p className={cn("mt-2 text-xs leading-relaxed", t.status === "failed" ? "text-critical-ink" : "text-ink-3")}>{t.error}</p>}
                        {t.external_url && <a href={t.external_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline">View live post <ExternalLink className="size-3" /></a>}
                      </li>
                    );
                  })}
                </ul>
                {manager && ["failed", "partial"].includes(status) && (
                  <Button className="mt-3 w-full" loading={retrying} onClick={async () => { const r = await retry(post.id); if (r.ok) router.refresh(); }}><RotateCcw /> Retry failed channels</Button>
                )}
              </CardBody>
            </Card>
          )}

          {/* Checks */}
          {editable && chosen.length > 0 && (
            <Card>
              <CardHeader title="Ready check" description="Each network's own rules, checked as you type" />
              <CardBody>
                <ul className="grid gap-2">
                  {checks.map(({ account, provider, chars, problem }) => (
                    <li key={account.id} className="flex items-start gap-2.5 text-xs">
                      {problem ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical-ink" aria-hidden /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-good-ink" aria-hidden />}
                      <span className="min-w-0 flex-1"><strong className="font-semibold text-ink">{account.display_name}</strong><span className={cn("block leading-snug", problem ? "text-critical-ink" : "text-ink-3")}>{problem ?? "Good to go"}</span></span>
                      <span className={cn("tabular shrink-0 font-semibold", chars > PROVIDERS[provider].maxChars ? "text-critical-ink" : "text-ink-3")}>{chars.toLocaleString("en-GB")}/{PROVIDERS[provider].maxChars.toLocaleString("en-GB")}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {/* Preview */}
          <Card>
            <CardHeader title="Preview" description={previewAccount ? `As it will read on ${PROVIDERS[previewProvider].name}` : "Pick a channel to preview"} />
            <CardBody>
              <div className="rounded-xl border border-line bg-surface-2 p-3.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={previewAccount?.display_name ?? "Boardroom Governance Summit"} src={previewAccount?.avatar_url} size="md" />
                  <div className="min-w-0"><p className="truncate text-[13px] font-bold text-ink">{previewAccount?.display_name ?? "Boardroom Governance Summit"}</p><p className="text-[11px] text-ink-3">{when ? formatDateTime(new Date(when).toISOString()) : "Now"}</p></div>
                  {previewAccount && <BrandIcon provider={previewProvider} size="sm" className="ml-auto" />}
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
                  {(previewAccount ? textFor(previewAccount.id) : content).split(/(#[\p{L}\p{N}_]+|https?:\/\/\S+)/gu).map((part, i) => (/^(#|https?:)/.test(part) ? <span key={i} className="font-medium text-accent-ink">{part}</span> : part)) }
                  {!content && !Object.keys(overrides).length && <span className="text-ink-3">Your post will appear here.</span>}
                </p>
                {attached.length > 0 && (
                  <div className={cn("mt-3 grid gap-1 overflow-hidden rounded-lg", attached.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                    {attached.slice(0, 4).map((m, i) => (
                      <div key={m.id} className={cn("relative bg-surface-3", attached.length === 1 ? "aspect-video" : "aspect-square", attached.length === 3 && i === 0 && "col-span-2 aspect-video")}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage host varies per project */}
                        {m.mime_type.startsWith("video/") ? <video src={`${m.url}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" /> : <img src={m.jpeg_url ?? m.url} alt="" className="size-full object-cover" />}
                        {i === 3 && attached.length > 4 && <span className="absolute inset-0 grid place-items-center bg-black/55 text-lg font-bold text-white">+{attached.length - 4}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {link && !attached.length && <p className="mt-3 truncate rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-2"><Link2 className="mr-1.5 inline size-3.5 text-ink-3" aria-hidden />{link}</p>}
              </div>
            </CardBody>
          </Card>

          {/* Schedule & actions */}
          {editable && (
            <Card>
              <CardHeader title="When" />
              <CardBody className="grid gap-3">
                <Field label="Date and time" htmlFor="post-when" hint={when ? `Accra: ${formatDateTime(new Date(when).toISOString())}` : "In your device's timezone. Leave empty to publish now or decide later."}>
                  <Input id="post-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => { const slot = nextSlot(queue, taken); if (slot) setWhen(toLocalInput(slot)); }}><Sparkles /> Next free slot</Button>
                  {when && <Button type="button" variant="ghost" size="sm" onClick={() => setWhen("")}><X /> Clear</Button>}
                </div>
                <p className="text-[11px] leading-relaxed text-ink-3">Queue slots (Accra): {queue.slots.join(" · ")}</p>

                <div className="mt-1 grid gap-2 border-t border-line pt-4">
                  {status === "pending_approval" && manager ? (
                    <>
                      <Button loading={approving} disabled={busy || blocked || !when} onClick={async () => { const r = await save(payload("draft")); if (r.ok) approve(post!.id, new Date(when).toISOString()); }}><CircleCheck /> Approve &amp; schedule</Button>
                      <Button variant="accent" disabled={busy || blocked} loading={saving} onClick={() => submit("publish")}><Rocket /> Approve &amp; publish now</Button>
                      <Button variant="outline" disabled={busy} onClick={() => setReturning(true)}><Undo2 /> Return for changes</Button>
                    </>
                  ) : manager ? (
                    <>
                      <Button disabled={busy || blocked || !when || !chosen.length} loading={saving} onClick={() => submit("schedule")}><CalendarClock /> {status === "scheduled" ? "Update schedule" : "Schedule"}</Button>
                      <Button variant="accent" disabled={busy || blocked || !chosen.length} onClick={() => submit("publish")}><Rocket /> Publish now</Button>
                    </>
                  ) : (
                    <Button disabled={busy || blocked || !chosen.length} loading={saving} onClick={() => submit("submit")}><Send /> Submit for approval</Button>
                  )}
                  {["draft", "pending_approval"].includes(status) && <Button variant="outline" disabled={busy} onClick={() => submit("draft")}><Save /> Save draft</Button>}
                  {blocked && <p className="text-xs text-critical-ink">Fix the items in the ready check first.</p>}
                  {!manager && <p className="text-[11px] leading-relaxed text-ink-3">A manager reviews it, then schedules or publishes. You&apos;ll be alerted either way.</p>}
                </div>
              </CardBody>
            </Card>
          )}

          {post && (mine || manager) && status !== "publishing" && (
            <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete post</Button>
          )}
        </div>
      </div>

      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent title="Media library" size="lg" description="Tap to attach — the numbers show the order they'll appear in." footer={<Button onClick={() => setPicker(false)}>Done</Button>}>
          <MediaLibrary media={media} compact selected={mediaIds} onToggle={(id) => setMediaIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 10 ? ids : [...ids, id]))} onUploaded={(id) => setMediaIds((ids) => (ids.length >= 10 ? ids : [...ids, id]))} />
        </DialogContent>
      </Dialog>

      <Dialog open={returning} onOpenChange={setReturning}>
        <DialogContent title="Return for changes" size="sm" description="The author is alerted with your note." footer={<><Button variant="outline" onClick={() => setReturning(false)}>Cancel</Button><Button loading={rejecting} disabled={!returnNote.trim()} onClick={() => post && reject(post.id, returnNote)}>Send back</Button></>}>
          <Field label="What should change?" htmlFor="return-note"><Textarea id="return-note" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} maxLength={1000} autoFocus /></Field>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} destructive loading={removing} title="Delete this post?" confirmLabel="Delete"
        description="The draft and its history are removed from the dashboard. Anything already published stays live on the networks." onConfirm={() => post && remove(post.id)} />
    </>
  );
}
