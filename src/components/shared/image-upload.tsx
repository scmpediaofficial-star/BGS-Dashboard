"use client";

import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

type ImageUploadProps = {
  value: string | null;
  onChange: (url: string | null) => void;
  /** Folder inside the public `assets` bucket. */
  folder: "avatars" | "panelists" | "sponsors";
  label: string;
  shape?: "circle" | "square";
  disabled?: boolean;
  className?: string;
};

/**
 * Uploads straight from the browser to Supabase Storage (row-level security
 * allows contributors and above) and hands back the public URL. The caller
 * saves that URL with the rest of its form.
 */
export function ImageUpload({ value, onChange, folder, label, shape = "square", disabled, className }: ImageUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!ACCEPT.includes(file.type)) return toast.error("Use a JPG, PNG, WebP or GIF image.");
    if (file.size > MAX_BYTES) return toast.error("That image is over 5 MB. Please choose a smaller one.");
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("assets").upload(path, file, { cacheControl: "31536000", contentType: file.type });
      if (error) throw error;
      onChange(supabase.storage.from("assets").getPublicUrl(path).data.publicUrl);
    } catch (err) {
      console.error(err);
      toast.error("The upload didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={cn("flex items-center gap-3.5", className)}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        aria-label={value ? `Replace ${label}` : `Upload ${label}`}
        className={cn(
          "relative grid size-16 shrink-0 place-items-center overflow-hidden border border-dashed border-line-strong bg-surface-2 text-ink-3 transition-colors hover:border-accent hover:text-accent-ink disabled:pointer-events-none",
          shape === "circle" ? "rounded-full" : "rounded-xl",
          value && "border-solid border-line",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, host varies per project
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-5" aria-hidden />
        )}
        {busy && <span className="absolute inset-0 grid place-items-center bg-surface/75"><LoaderCircle className="size-5 animate-spin text-accent" aria-hidden /></span>}
      </button>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-ink-2">{label}</p>
        <p className="text-xs text-ink-3">JPG, PNG or WebP, up to 5 MB.</p>
        {!disabled && (
          <div className="mt-1.5 flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} loading={busy}>{value ? "Replace" : "Upload"}</Button>
            {value && <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}><Trash2 /> Remove</Button>}
          </div>
        )}
      </div>
      <input ref={input} type="file" accept={ACCEPT.join(",")} className="sr-only" tabIndex={-1} onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); }} />
    </div>
  );
}
