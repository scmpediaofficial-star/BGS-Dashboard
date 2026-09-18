"use client";

import { useRef, useState } from "react";
import { Check, Film, ImagePlus, LoaderCircle, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { deleteMedia, registerMedia } from "@/app/(app)/social/actions";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type MediaItem = { id: string; url: string; jpeg_url: string | null; file_name: string; mime_type: string; alt_text: string | null; size_bytes: number; width: number | null; height: number | null };

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm";
const MAX_BYTES = 50 * 1024 * 1024; // Supabase's free-plan upload ceiling

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`;

/**
 * Instagram only accepts JPEG and Bluesky caps images near 1 MB, so every image
 * also gets a ≤2048px JPEG copy, made right here in the browser.
 */
async function jpegCopy(file: File): Promise<{ blob: Blob; width: number; height: number } | null> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff"; // transparent PNGs flatten onto white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.76, 0.64]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && (blob.size < 950_000 || quality === 0.64)) return { blob, width: bitmap.width, height: bitmap.height };
    }
  } catch { /* unsupported format: the original is used as-is */ }
  return null;
}

function videoFacts(file: File): Promise<{ width: number; height: number; duration: number } | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (value: { width: number; height: number; duration: number } | null) => { URL.revokeObjectURL(url); resolve(value); };
    video.preload = "metadata";
    video.onloadedmetadata = () => finish({ width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : 0 });
    video.onerror = () => finish(null);
    video.src = url;
  });
}

type Props = {
  media: MediaItem[];
  /** Picker mode: ids in selection order. */
  selected?: string[];
  onToggle?: (id: string) => void;
  onUploaded?: (id: string) => void;
  compact?: boolean;
};

/** The shared image & video shelf: a manager on the Channels page, a picker inside the composer. */
export function MediaLibrary({ media, selected, onToggle, onUploaded, compact }: Props) {
  const { viewer, can } = useViewer();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [register] = useAction(registerMedia, { silent: true });
  const [remove] = useAction(deleteMedia, { success: "Removed from the library" });
  const picking = Boolean(onToggle);

  async function upload(files: FileList) {
    const supabase = createClient();
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) { toast.error(`“${file.name}” is ${mb(file.size)} — the limit is 50 MB per file.`); continue; }
      setBusy(file.name);
      try {
        const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        const key = `${viewer.id}/${crypto.randomUUID()}`;
        const path = `${key}.${ext}`;
        const { error } = await supabase.storage.from("social-media").upload(path, file, { cacheControl: "31536000", contentType: file.type });
        if (error) throw error;

        let jpegPath: string | null = null, width: number | null = null, height: number | null = null, duration: number | null = null;
        if (file.type.startsWith("video/")) {
          const facts = await videoFacts(file);
          if (facts) ({ width, height, duration } = facts);
        } else {
          const copy = await jpegCopy(file);
          if (copy) {
            width = copy.width; height = copy.height;
            // A JPEG that is already light enough is its own copy.
            if (file.type === "image/jpeg" && file.size < 950_000) jpegPath = path;
            else {
              const target = `${key}-web.jpg`;
              const res = await supabase.storage.from("social-media").upload(target, copy.blob, { cacheControl: "31536000", contentType: "image/jpeg" });
              if (!res.error) jpegPath = target;
            }
          }
        }
        const result = await register({ path, file_name: file.name, mime_type: file.type, size_bytes: file.size, jpeg_path: jpegPath, width, height, duration_seconds: duration ? Math.round(duration * 100) / 100 : null });
        if (result.ok) { toast.success(`Added “${file.name}”`); onUploaded?.(result.data.id); }
      } catch (err) {
        console.error(err);
        toast.error(`“${file.name}” didn't upload. Check your connection and try again.`);
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      {can("social.draft") && (
        <div className={cn("mb-3 flex items-center gap-3", compact && "mb-2.5")}>
          <Button type="button" variant="outline" size={compact ? "sm" : "md"} onClick={() => input.current?.click()} loading={Boolean(busy)}><Upload /> Upload</Button>
          <p className="min-w-0 truncate text-xs text-ink-3">{busy ? `Uploading ${busy}…` : "Images and MP4 video, up to 50 MB each."}</p>
          <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.length && upload(e.target.files)} />
        </div>
      )}

      {media.length === 0 ? (
        <EmptyState icon={ImagePlus} title="No media yet" description="Upload the summit artwork, panelist cards and clips you'll post." className={compact ? "py-6" : "py-10"} />
      ) : (
        <ul className={cn("grid gap-2.5", compact ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6")}>
          {media.map((item) => {
            const order = selected ? selected.indexOf(item.id) : -1;
            const chosen = order >= 0;
            const video = item.mime_type.startsWith("video/");
            return (
              <li key={item.id} className="group relative">
                <button
                  type="button"
                  disabled={!picking}
                  onClick={() => onToggle?.(item.id)}
                  aria-pressed={picking ? chosen : undefined}
                  aria-label={`${picking ? (chosen ? "Remove" : "Attach") : "Media"}: ${item.alt_text || item.file_name}`}
                  className={cn("relative block aspect-square w-full overflow-hidden rounded-xl border bg-surface-3 outline-offset-2 transition-shadow", chosen ? "border-accent ring-2 ring-accent" : "border-line", picking && "hover:shadow-raised")}
                >
                  {video ? (
                    <video src={`${item.url}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage host varies per project
                    <img src={item.jpeg_url ?? item.url} alt={item.alt_text ?? ""} loading="lazy" className="size-full object-cover" />
                  )}
                  {video && <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-black/60 text-white"><Film className="size-3.5" aria-hidden /></span>}
                  {chosen && <span className="tabular absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">{selected!.length > 1 ? order + 1 : <Check className="size-3.5" strokeWidth={3} />}</span>}
                </button>
                <p className="mt-1 truncate text-[11px] text-ink-3" title={item.file_name}>{item.file_name} · {mb(item.size_bytes)}</p>
                {!picking && can("social.draft") && (
                  <button type="button" onClick={() => remove(item.id)} aria-label={`Delete ${item.file_name}`} className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-lg bg-surface/90 text-ink-2 opacity-0 shadow-card transition-opacity hover:text-critical-ink focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {busy && <p className="sr-only" role="status"><LoaderCircle aria-hidden /> Uploading {busy}</p>}
    </div>
  );
}
