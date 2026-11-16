"use client";

import { useNavRouter } from "@/lib/hooks/use-nav-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CircleAlert, CircleCheck, ExternalLink, EyeOff, FolderPlus, Hourglass, ImagePlus, Images, Info, LoaderCircle, Newspaper, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { addGalleryPhotos, deleteGalleryPhoto, saveGalleryCaption, setGalleryPhotoVisibility } from "@/app/(app)/website/actions";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Switch } from "@/components/ui/form";
import { EmptyState, Meter, PageHeader } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ALBUM_PATTERN, DEFAULT_ALBUMS, galleryFolder, galleryUrl, type GalleryPhoto } from "@/components/website/types";
import { WEB_IMAGE_TYPES, discardWebImages, friendlyImageError, prepareWebImage, uploadWebImage } from "@/components/website/web-image";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { cn, pluralize, timeAgo } from "@/lib/utils";

type UploadState = "waiting" | "resizing" | "uploading" | "saving" | "done" | "failed";
type UploadItem = { key: string; name: string; size: number; state: UploadState; error?: string };

const STEP: Record<UploadState, number> = { waiting: 0, resizing: 20, uploading: 55, saving: 85, done: 100, failed: 100 };
const STEP_LABEL: Record<UploadState, string> = { waiting: "Waiting", resizing: "Resizing…", uploading: "Uploading…", saving: "Uploaded", done: "Added", failed: "Didn't upload" };
const MAX_BATCH = 100;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const validAlbum = (year: string) => ALBUM_PATTERN.test(year) && Number(year) >= 2024 && Number(year) <= 2100;

type Props = { photos: GalleryPhoto[]; currentYear: string };

export function GalleryView({ photos, currentYear }: Props) {
  const { viewer, can } = useViewer();
  const router = useNavRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useRealtimeRefresh(["website_gallery_photos"]);

  const requested = params.get("album") ?? "";
  const albums = useMemo(() => {
    const years = new Set([...DEFAULT_ALBUMS, ...photos.map((p) => p.album), ...(validAlbum(requested) ? [requested] : [])]);
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [photos, requested]);
  const album = validAlbum(requested) ? requested : albums.includes(currentYear) ? currentYear : albums[0];
  const inAlbum = photos.filter((p) => p.album === album);
  const shown = inAlbum.filter((p) => p.is_published).length;

  const setAlbum = useCallback((year: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("album", year);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  // ── Uploads: resized here, stored one by one, then recorded together ──────
  const canWrite = can("website.write");
  const picker = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [queueAlbum, setQueueAlbum] = useState(album);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [record] = useAction(addGalleryPhotos, { success: (r) => `${pluralize(r.count, "photo")} added to the ${r.album} gallery` });

  // Leaving mid-upload would strand the files, so the browser asks first.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length || busy || !canWrite) return;
    if (files.length > MAX_BATCH) return void toast.error(`Choose up to ${MAX_BATCH} photos at a time.`);
    const target = album;
    const batch: UploadItem[] = files.map((file) => ({ key: crypto.randomUUID(), name: file.name, size: file.size, state: "waiting" }));
    const update = (key: string, patch: Partial<UploadItem>) => setQueue((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setQueue(batch);
    setQueueAlbum(target);
    setBusy(true);

    const stored: { key: string; path: string; width: number; height: number }[] = [];
    for (let i = 0; i < files.length; i++) {
      const key = batch[i].key;
      try {
        update(key, { state: "resizing" });
        const { blob, width, height } = await prepareWebImage(files[i]);
        update(key, { state: "uploading" });
        const { path } = await uploadWebImage(blob, galleryFolder(target));
        update(key, { state: "saving" });
        stored.push({ key, path, width, height });
      } catch (err) {
        update(key, { state: "failed", error: friendlyImageError(err) });
      }
    }

    if (stored.length) {
      const result = await record({ album: target, photos: stored.map(({ path, width, height }) => ({ path, width, height })) });
      for (const item of stored) update(item.key, result.ok ? { state: "done" } : { state: "failed", error: result.error });
      if (!result.ok) void discardWebImages(stored.map((item) => item.path));
    }
    setBusy(false);
    if (picker.current) picker.current.value = "";
  }

  const finished = queue.filter((i) => i.state === "done").length;
  const failed = queue.filter((i) => i.state === "failed").length;
  const progressLine = busy
    ? `Adding to the ${queueAlbum} gallery: ${queue.filter((i) => i.state !== "waiting").length} of ${queue.length}…`
    : [finished && `${pluralize(finished, "photo")} added to the ${queueAlbum} gallery`, failed && `${failed} didn't upload`].filter(Boolean).join(" · ");

  // ── New album, delete ─────────────────────────────────────────────────────
  const [albumDialog, setAlbumDialog] = useState(false);
  const [newYear, setNewYear] = useState("");
  const [yearError, setYearError] = useState<string | null>(null);
  function openAlbum(e: React.FormEvent) {
    e.preventDefault();
    const year = newYear.trim();
    if (!validAlbum(year)) return setYearError("Use the edition's four-digit year, from 2024 on, e.g. 2027.");
    setAlbum(year);
    setAlbumDialog(false);
    setNewYear("");
    setYearError(null);
  }

  const [deleting, setDeleting] = useState<GalleryPhoto | null>(null);
  const [remove, removing] = useAction(deleteGalleryPhoto, { onSuccess: () => setDeleting(null) });

  return (
    <>
      <PageHeader
        eyebrow="Website"
        title="Gallery"
        description="Photos added to each edition's gallery on the public website, with their captions."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/website"><Newspaper /> News articles</Link></Button>
            <Button asChild variant="outline"><a href={galleryUrl(album)} target="_blank" rel="noopener noreferrer"><ExternalLink /> View {album} gallery</a></Button>
          </>
        }
      />

      <div className="mb-4 flex items-end gap-3 border-b border-line">
        <Tabs value={album} onValueChange={setAlbum} className="min-w-0 flex-1">
          <TabsList aria-label="Albums" className="border-b-0">
            {albums.map((year) => {
              const count = photos.filter((p) => p.album === year).length;
              return (
                <TabsTrigger key={year} value={year}>
                  {year}
                  <span className="tabular rounded-full bg-surface-3 px-1.5 text-[10.5px] text-ink-3">{count}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        {canWrite && (
          <Button type="button" variant="ghost" size="sm" className="mb-1.5 h-9 shrink-0" onClick={() => setAlbumDialog(true)}>
            <FolderPlus /> <span className="max-sm:sr-only">New album</span>
          </Button>
        )}
      </div>

      <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-ink-3">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Photos that ship with the website itself aren&apos;t listed here. Photos added here appear after them in the {album} gallery at {galleryUrl(album).replace(/^https?:\/\//, "")}, unless you switch them off.
          {inAlbum.length > 0 && <> <strong className="font-semibold text-ink-2">{shown} of {inAlbum.length}</strong> shown on the website.</>}
        </span>
      </p>

      {canWrite && (
        <Card
          className={cn("mb-5 border-2 border-dashed p-4 transition-colors sm:p-5", dragging ? "border-accent bg-accent-soft" : "border-line-strong")}
          onDragOver={(e) => { if (!busy && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
          aria-label={`Add photos to the ${album} gallery`}
        >
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-ink"><ImagePlus className="size-5" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-ink">Add photos to the {album} gallery</p>
              <p className="mt-0.5 text-xs text-ink-3">JPG, PNG or WebP. Drop them here or choose them. Each is resized to 2,000 px on its long side and saved as a JPEG before it uploads. Keep this page open until they finish.</p>
            </div>
            <Button type="button" onClick={() => picker.current?.click()} loading={busy}>{!busy && <Upload />} {busy ? "Uploading…" : "Choose photos"}</Button>
            <input ref={picker} type="file" multiple accept={WEB_IMAGE_TYPES.join(",")} className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.length && void addFiles(e.target.files)} />
          </div>

          {queue.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-ink-2" role="status" aria-live="polite">{progressLine}</p>
                {!busy && <Button type="button" variant="ghost" size="sm" onClick={() => setQueue([])}><X /> Clear</Button>}
              </div>
              <ul aria-label="Uploads" className="scroll-slim grid max-h-72 gap-1.5 overflow-y-auto pr-1">
                {queue.map((item) => (
                  <li key={item.key} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
                    {item.state === "done" ? <CircleCheck className="size-4 shrink-0 text-good-ink" aria-hidden />
                      : item.state === "failed" ? <CircleAlert className="size-4 shrink-0 text-critical-ink" aria-hidden />
                      : item.state === "waiting" ? <Hourglass className="size-4 shrink-0 text-ink-3" aria-hidden />
                      : <LoaderCircle className="size-4 shrink-0 animate-spin text-accent" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate font-semibold text-ink" title={item.name}>{item.name}</span>
                        <span className={cn("shrink-0", item.state === "failed" ? "font-semibold text-critical-ink" : "text-ink-3")}>{STEP_LABEL[item.state]}</span>
                      </p>
                      {item.state === "failed" ? (
                        <p className="mt-0.5 text-xs text-critical-ink">{item.error}</p>
                      ) : (
                        <Meter className="mt-1.5" size="sm" value={STEP[item.state]} max={100} tone={item.state === "done" ? "good" : "accent"} label={`${item.name}: ${STEP_LABEL[item.state]}`} />
                      )}
                    </div>
                    <span className="tabular hidden shrink-0 text-[11px] text-ink-3 sm:block">{mb(item.size)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {inAlbum.length === 0 ? (
        <Card>
          <EmptyState
            icon={Images}
            title={`No photos added to the ${album} gallery yet`}
            description={`Photos that ship with the website itself aren't listed here. Photos you add appear after them in the ${album} gallery on the website.${!DEFAULT_ALBUMS.includes(album) ? " This album is saved once its first photo is added." : ""}`}
            action={canWrite ? <Button variant="outline" onClick={() => picker.current?.click()} disabled={busy}><Upload /> Choose photos</Button> : undefined}
          />
        </Card>
      ) : (
        <ul aria-label={`${album} gallery`} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {inAlbum.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              number={index + 1}
              canEdit={canWrite}
              canDelete={canWrite && (photo.created_by === viewer.id || can("website.publish"))}
              onDelete={() => setDeleting(photo)}
            />
          ))}
        </ul>
      )}

      <Dialog open={albumDialog} onOpenChange={(next) => { setAlbumDialog(next); if (!next) setYearError(null); }}>
        <DialogContent
          size="sm"
          title="New album"
          description="Albums are edition years. Photos you add go to that year's gallery on the website."
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setAlbumDialog(false)}>Cancel</Button>
              <Button type="submit" form="album-form">Open album</Button>
            </>
          }
        >
          <form id="album-form" onSubmit={openAlbum}>
            <Field label="Edition year" htmlFor="album-year" error={yearError} hint="The album is saved once its first photo is added.">
              <Input id="album-year" value={newYear} onChange={(e) => { setNewYear(e.target.value.replace(/\D/g, "").slice(0, 4)); setYearError(null); }} inputMode="numeric" autoComplete="off" placeholder={String(Number(currentYear) + 1)} autoFocus aria-invalid={Boolean(yearError)} />
            </Field>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Delete this photo?"
        description={`It is removed from the ${deleting?.album ?? ""} gallery on the website and from storage. This can't be undone. To take it off the website for now, switch “On website” off instead.`}
        confirmLabel="Delete"
        destructive
        loading={removing}
        onConfirm={() => deleting && remove(deleting.id)}
      />
    </>
  );
}

type CardProps = { photo: GalleryPhoto; number: number; canEdit: boolean; canDelete: boolean; onDelete: () => void };

function PhotoCard({ photo, number, canEdit, canDelete, onDelete }: CardProps) {
  // Local caption while typing; a change from elsewhere (another editor, a refresh) replaces it.
  const [caption, setCaption] = useState(photo.caption);
  const [synced, setSynced] = useState(photo.caption);
  if (photo.caption !== synced) { setSynced(photo.caption); setCaption(photo.caption); }

  const [saveCaption, savingCaption] = useAction(saveGalleryCaption, { success: "Caption saved" });
  const [setVisible, toggling] = useAction(setGalleryPhotoVisibility, { success: photo.is_published ? "Hidden from the website" : "Back on the website" });
  const dirty = caption.trim() !== photo.caption;
  const commit = () => { if (dirty && !savingCaption) void saveCaption(photo.id, caption.trim()); };
  const name = photo.caption ? `“${photo.caption}”` : `photo ${number}`;
  const switchId = `photo-visible-${photo.id}`;

  return (
    <li className={cn("overflow-hidden rounded-card border bg-surface shadow-card", photo.is_published ? "border-line" : "border-dashed border-line-strong")}>
      <div className="relative">
        <a href={photo.image_url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name} full size (new tab)`} className="block aspect-[4/3] bg-surface-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage host varies per project */}
          <img src={photo.image_url} alt={photo.caption} loading="lazy" className={cn("size-full object-cover transition-opacity", !photo.is_published && "opacity-45 grayscale")} />
        </a>
        {!photo.is_published && <Badge tone="neutral" icon={EyeOff} size="sm" className="pointer-events-none absolute left-2 top-2 shadow-card">Hidden</Badge>}
        {canDelete && (
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${name}`} onClick={onDelete} className="absolute right-1.5 top-1.5 bg-surface/90 text-ink-2 shadow-card hover:bg-critical-soft hover:text-critical-ink">
            <Trash2 />
          </Button>
        )}
      </div>
      <div className="grid gap-2 p-2.5">
        {canEdit ? (
          <div className="relative">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commit(); }
                if (e.key === "Escape" && dirty) { e.preventDefault(); setCaption(photo.caption); }
              }}
              maxLength={300}
              placeholder="Add a caption…"
              aria-label={`Caption for photo ${number}`}
              className={cn("h-9 text-xs", savingCaption && "pr-8")}
            />
            {savingCaption && <LoaderCircle aria-hidden className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-accent" />}
          </div>
        ) : (
          <p className="line-clamp-2 min-h-9 text-xs leading-snug text-ink-2">{photo.caption || <span className="text-ink-3">No caption</span>}</p>
        )}
        <div className="flex min-h-9 items-center gap-2">
          <Switch id={switchId} checked={photo.is_published} disabled={!canEdit || toggling} onCheckedChange={(visible) => setVisible(photo.id, visible)} />
          <label htmlFor={switchId} className="text-xs font-semibold text-ink-2">On website</label>
        </div>
        <p className="truncate text-[11px] text-ink-3" title={photo.uploader?.full_name ?? undefined}>
          {photo.uploader?.full_name ?? "Former member"} · {timeAgo(photo.created_at)}
          {photo.width && photo.height ? <span className="tabular"> · {photo.width}×{photo.height}</span> : null}
        </p>
      </div>
    </li>
  );
}
