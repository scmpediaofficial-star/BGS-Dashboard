-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 14 · Website content (boardroomgovsummit.com)
--
--  The public website reads its news articles and extra gallery photos from
--  these two tables. The dashboard's Website module writes them.
--
--  • website_articles: news, speeches and insights. The body is Markdown. An
--    article's address on the website is /YYYY/MM/DD/<slug>/, built from
--    published_at (Accra time = UTC), the same permalink shape WordPress used,
--    so links already sent out in newsletters keep working.
--  • website_gallery_photos: photos added to an edition's gallery (album =
--    the edition year, e.g. '2026'). They appear after the photos that ship
--    with the website itself.
--
--  Who can do what (row-level security is the gate):
--    anyone (the website)  reads published articles whose date has arrived, and
--                          published photos
--    viewer and above      read everything, drafts included
--    contributor and above create and edit drafts, upload photos
--    manager and above     publish, unpublish, edit published articles, delete
--
--  Images are uploaded to the existing public `assets` bucket under website/.
--  Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.article_status as enum ('draft', 'published');
exception when duplicate_object then null;
end $$;

-- ── Articles ────────────────────────────────────────────────────────────────
create table if not exists public.website_articles (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null check (length(trim(title)) > 0),
  category     text not null default 'Summit News'
               check (category in ('Announcements', 'Speeches', 'Insights', 'Summit News')),
  excerpt      text not null default '',
  body         text not null default '',            -- Markdown
  cover_url    text,                                -- absolute URL, or a path on the website ("/media/…")
  cover_alt    text not null default '',
  author       text,
  status       public.article_status not null default 'draft',
  published_at timestamptz,                         -- the date shown, and the date in the permalink
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint website_articles_published_dated check (status = 'draft' or published_at is not null)
);

create index if not exists website_articles_listing_idx on public.website_articles (status, published_at desc);

drop trigger if exists website_articles_touch on public.website_articles;
create trigger website_articles_touch before update on public.website_articles
  for each row execute function public.touch_updated_at();

alter table public.website_articles enable row level security;

drop policy if exists "website articles: public read"   on public.website_articles;
drop policy if exists "website articles: team read"     on public.website_articles;
drop policy if exists "website articles: insert"        on public.website_articles;
drop policy if exists "website articles: update"        on public.website_articles;
drop policy if exists "website articles: delete"        on public.website_articles;

create policy "website articles: public read" on public.website_articles for select to anon, authenticated
  using (status = 'published' and published_at <= now());
create policy "website articles: team read" on public.website_articles for select to authenticated
  using ((select public.has_role('viewer')));
-- Contributors write drafts; only managers may create or leave a row published.
create policy "website articles: insert" on public.website_articles for insert to authenticated
  with check ((select public.has_role('contributor')) and (status = 'draft' or (select public.has_role('manager'))));
create policy "website articles: update" on public.website_articles for update to authenticated
  using ((select public.has_role('contributor')) and (status = 'draft' or (select public.has_role('manager'))))
  with check ((select public.has_role('contributor')) and (status = 'draft' or (select public.has_role('manager'))));
create policy "website articles: delete" on public.website_articles for delete to authenticated
  using ((select public.has_role('manager')));

grant select on public.website_articles to anon;

-- ── Gallery photos ──────────────────────────────────────────────────────────
create table if not exists public.website_gallery_photos (
  id           uuid primary key default gen_random_uuid(),
  album        text not null check (album ~ '^[0-9]{4}$'),
  image_url    text not null,
  width        integer check (width is null or width > 0),
  height       integer check (height is null or height > 0),
  caption      text not null default '',
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create index if not exists website_gallery_album_idx on public.website_gallery_photos (album, sort_order, created_at);

alter table public.website_gallery_photos enable row level security;

drop policy if exists "website gallery: public read" on public.website_gallery_photos;
drop policy if exists "website gallery: team read"   on public.website_gallery_photos;
drop policy if exists "website gallery: write"       on public.website_gallery_photos;
drop policy if exists "website gallery: update"      on public.website_gallery_photos;
drop policy if exists "website gallery: delete"      on public.website_gallery_photos;

create policy "website gallery: public read" on public.website_gallery_photos for select to anon, authenticated
  using (is_published);
create policy "website gallery: team read" on public.website_gallery_photos for select to authenticated
  using ((select public.has_role('viewer')));
create policy "website gallery: write" on public.website_gallery_photos for insert to authenticated
  with check ((select public.has_role('contributor')));
create policy "website gallery: update" on public.website_gallery_photos for update to authenticated
  using ((select public.has_role('contributor'))) with check ((select public.has_role('contributor')));
create policy "website gallery: delete" on public.website_gallery_photos for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.has_role('manager')));

grant select on public.website_gallery_photos to anon;

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['website_articles', 'website_gallery_photos'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
