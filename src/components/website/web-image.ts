import { createClient } from "@/lib/supabase/client";

export const WEB_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** A problem with one file, worded for the person who chose it. */
export class ImageProblem extends Error {}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  // Drawing an <img> applies the camera's EXIF rotation in every current browser, so portrait shots stay upright.
  return img.decode().then(() => img).finally(() => URL.revokeObjectURL(url));
}

/**
 * Makes a photo fit for the website, here in the browser: at most `maxEdge`
 * pixels on its long side, re-encoded as JPEG. A 12 MB phone photo becomes a
 * few hundred kilobytes, and the size it ends up is returned with it.
 */
export async function prepareWebImage(file: File, { maxEdge = 2000, quality = 0.82 } = {}): Promise<{ blob: Blob; width: number; height: number }> {
  if (!WEB_IMAGE_TYPES.includes(file.type)) throw new ImageProblem("Use a JPG, PNG or WebP photo.");
  if (file.size > MAX_SOURCE_BYTES) throw new ImageProblem(`It's ${mb(file.size)}. Choose a photo under 40 MB.`);

  let img: HTMLImageElement;
  try {
    img = await decode(file);
  } catch {
    throw new ImageProblem("This photo couldn't be opened. Save it again as a JPG and try once more.");
  }
  const sourceWidth = img.naturalWidth;
  const sourceHeight = img.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new ImageProblem("This photo couldn't be opened. Save it again as a JPG and try once more.");

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageProblem("Your browser couldn't resize this photo. Try another browser.");
  ctx.fillStyle = "#ffffff"; // a transparent PNG flattens onto white, not black
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new ImageProblem("Your browser couldn't resize this photo. Try another browser.");
  return { blob, width, height };
}

/** Stores a prepared JPEG in the public `assets` bucket under `folder` (which ends in `/`). */
export async function uploadWebImage(blob: Blob, folder: string): Promise<{ path: string; url: string }> {
  const supabase = createClient();
  const path = `${folder}${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("assets").upload(path, blob, { cacheControl: "31536000", contentType: "image/jpeg" });
  if (error) {
    console.error("[website] upload failed:", error.message);
    if (/row-level security|unauthori[sz]ed|forbidden|jwt/i.test(error.message)) throw new ImageProblem("You don't have permission to upload. Ask a manager, or sign in again.");
    if (/size|too large|exceed/i.test(error.message)) throw new ImageProblem("The resized photo is still over the 10 MB limit.");
    throw new ImageProblem("The upload didn't go through. Check your connection and try again.");
  }
  return { path, url: supabase.storage.from("assets").getPublicUrl(path).data.publicUrl };
}

/** Removes uploads that never made it into a record (best effort). */
export async function discardWebImages(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await createClient().storage.from("assets").remove(paths);
  if (error) console.error("[website] could not remove unused uploads:", error.message);
}

export function friendlyImageError(err: unknown): string {
  if (err instanceof ImageProblem) return err.message;
  console.error(err);
  return "Something went wrong with this photo. Try again.";
}
