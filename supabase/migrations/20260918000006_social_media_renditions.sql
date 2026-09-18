-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 06 · Social media renditions
--  Instagram only ingests JPEG and Bluesky caps images at about 1 MB, so the
--  media library makes a ≤2048px JPEG copy of every image at upload time.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.social_media add column if not exists jpeg_url  text;
alter table public.social_media add column if not exists jpeg_path text;
