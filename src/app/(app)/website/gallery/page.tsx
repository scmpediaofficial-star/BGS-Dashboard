import type { Metadata } from "next";
import { GalleryView } from "@/components/website/gallery-view";
import { requireSession } from "@/lib/auth/session";
import { isoDay } from "@/lib/utils";

export const metadata: Metadata = { title: "Gallery" };

export default async function WebsiteGalleryPage() {
  const { supabase } = await requireSession();

  const { data } = await supabase
    .from("website_gallery_photos")
    .select("id, album, image_url, width, height, caption, sort_order, is_published, created_by, created_at, uploader:profiles!website_gallery_photos_created_by_fkey(full_name)")
    .order("album", { ascending: false })
    .order("sort_order")
    .order("created_at");

  return <GalleryView photos={data ?? []} currentYear={isoDay().slice(0, 4)} />;
}
