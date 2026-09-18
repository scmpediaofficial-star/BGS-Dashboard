-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 02 · Security
--  Roles, row-level security, storage and realtime.
--
--  Role ladder (each role includes everything below it):
--    viewer       read-only access to summit data
--    contributor  create & edit records, draft social posts, upload media
--    manager      delete records, approve & publish social posts, manage tickets
--    admin        manage people, integrations and settings
--    super_admin  manage admins; cannot be removed by anyone else
-- ════════════════════════════════════════════════════════════════════════════

-- ── Role helpers ────────────────────────────────────────────────────────────
create or replace function public.role_rank(r public.user_role)
returns int language sql immutable as $$
  select case r
    when 'super_admin' then 5
    when 'admin'       then 4
    when 'manager'     then 3
    when 'contributor' then 2
    when 'viewer'      then 1
    else 0
  end
$$;

-- The caller's role, or null when signed out / deactivated.
create or replace function public.auth_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.has_role(min_role public.user_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.role_rank(public.auth_role()) >= public.role_rank(min_role), false)
$$;

revoke all on function public.auth_role() from public, anon;
revoke all on function public.has_role(public.user_role) from public, anon;
grant execute on function public.auth_role() to authenticated, service_role;
grant execute on function public.has_role(public.user_role) to authenticated, service_role;

-- ── New auth user → profile ─────────────────────────────────────────────────
-- Access is invitation-only. Whatever creates an auth user — including the
-- public sign-up endpoint — only ever gets a locked, inactive viewer profile,
-- which every policy below denies. Roles are granted afterwards by the server
-- (service role) once an administrator has been authorised: see
-- src/lib/auth/provision.ts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  usr jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(usr ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    'viewer',
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Guard privileged profile columns ────────────────────────────────────────
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  caller public.user_role;
begin
  -- Service role / SQL editor: no end-user JWT, nothing to guard against.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email then
    caller := public.auth_role();
    if caller is null or public.role_rank(caller) < public.role_rank('admin') then
      raise exception 'Only administrators can change roles or account status';
    end if;
    if (old.role = 'super_admin' or new.role = 'super_admin') and caller <> 'super_admin' then
      raise exception 'Only a super admin can grant or change the super admin role';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- The summit must always keep at least one active super admin.
create or replace function public.keep_one_super_admin()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'super_admin' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'super_admin' or not new.is_active) then
    if not exists (
      select 1 from public.profiles
      where role = 'super_admin' and is_active and id <> old.id
    ) then
      raise exception 'At least one active super admin is required';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger profiles_keep_super_admin before update or delete on public.profiles
  for each row execute function public.keep_one_super_admin();

-- ════════════════════════════════════════════════════════════════════════════
--  Row-level security
-- ════════════════════════════════════════════════════════════════════════════
alter table public.profiles               enable row level security;
alter table public.workstreams            enable row level security;
alter table public.deliverables           enable row level security;
alter table public.comments               enable row level security;
alter table public.panels                 enable row level security;
alter table public.panelists              enable row level security;
alter table public.panel_questions        enable row level security;
alter table public.outreach_contacts      enable row level security;
alter table public.sponsors               enable row level security;
alter table public.ticket_types           enable row level security;
alter table public.ticket_sales           enable row level security;
alter table public.meetings               enable row level security;
alter table public.action_items           enable row level security;
alter table public.social_apps            enable row level security;  -- no policies: service role only
alter table public.social_accounts        enable row level security;
alter table public.social_account_secrets enable row level security;  -- no policies: service role only
alter table public.social_media           enable row level security;
alter table public.social_posts           enable row level security;
alter table public.social_post_targets    enable row level security;
alter table public.social_templates       enable row level security;
alter table public.social_hashtag_groups  enable row level security;
alter table public.activity_log           enable row level security;
alter table public.notifications          enable row level security;
alter table public.push_subscriptions     enable row level security;
alter table public.email_log              enable row level security;
alter table public.app_settings           enable row level security;

-- ── Profiles ────────────────────────────────────────────────────────────────
create policy "profiles: team can read" on public.profiles
  for select to authenticated using ((select public.has_role('viewer')) or id = (select auth.uid()));
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: admins update anyone" on public.profiles
  for update to authenticated using ((select public.has_role('admin'))) with check ((select public.has_role('admin')));

-- ── Standard operational tables: read = viewer, write = contributor, delete = manager
do $$
declare
  t text;
begin
  foreach t in array array[
    'workstreams', 'deliverables', 'panels', 'panelists', 'panel_questions',
    'outreach_contacts', 'sponsors', 'meetings', 'action_items',
    'social_templates', 'social_hashtag_groups'
  ] loop
    execute format('create policy "%1$s: read"   on public.%1$I for select to authenticated using ((select public.has_role(''viewer'')))', t);
    execute format('create policy "%1$s: insert" on public.%1$I for insert to authenticated with check ((select public.has_role(''contributor'')))', t);
    execute format('create policy "%1$s: update" on public.%1$I for update to authenticated using ((select public.has_role(''contributor''))) with check ((select public.has_role(''contributor'')))', t);
    execute format('create policy "%1$s: delete" on public.%1$I for delete to authenticated using ((select public.has_role(''manager'')))', t);
  end loop;
end $$;

-- ── Tickets: money-adjacent, so writes need manager ─────────────────────────
create policy "ticket_types: read"   on public.ticket_types for select to authenticated using ((select public.has_role('viewer')));
create policy "ticket_types: write"  on public.ticket_types for all    to authenticated using ((select public.has_role('manager'))) with check ((select public.has_role('manager')));
create policy "ticket_sales: read"   on public.ticket_sales for select to authenticated using ((select public.has_role('viewer')));
create policy "ticket_sales: write"  on public.ticket_sales for all    to authenticated using ((select public.has_role('manager'))) with check ((select public.has_role('manager')));

-- ── Comments ────────────────────────────────────────────────────────────────
create policy "comments: read"   on public.comments for select to authenticated using ((select public.has_role('viewer')));
create policy "comments: insert" on public.comments for insert to authenticated
  with check ((select public.has_role('contributor')) and author_id = (select auth.uid()));
create policy "comments: delete" on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.has_role('manager')));

-- ── Social Studio ───────────────────────────────────────────────────────────
create policy "social_accounts: read"  on public.social_accounts for select to authenticated using ((select public.has_role('viewer')));
-- Connecting / removing accounts happens server-side with the service role after an admin check.

create policy "social_media: read"   on public.social_media for select to authenticated using ((select public.has_role('viewer')));
create policy "social_media: insert" on public.social_media for insert to authenticated with check ((select public.has_role('contributor')));
create policy "social_media: update" on public.social_media for update to authenticated using ((select public.has_role('contributor'))) with check ((select public.has_role('contributor')));
create policy "social_media: delete" on public.social_media for delete to authenticated
  using (uploaded_by = (select auth.uid()) or (select public.has_role('manager')));

create policy "social_posts: read"   on public.social_posts for select to authenticated using ((select public.has_role('viewer')));
create policy "social_posts: insert" on public.social_posts for insert to authenticated
  with check ((select public.has_role('contributor')) and author_id = (select auth.uid()));
-- Contributors may only touch their own unpublished drafts; managers may touch anything.
create policy "social_posts: update" on public.social_posts for update to authenticated
  using (
    (select public.has_role('manager'))
    or ((select public.has_role('contributor')) and author_id = (select auth.uid()) and status in ('draft', 'pending_approval'))
  )
  with check (
    (select public.has_role('manager'))
    or ((select public.has_role('contributor')) and author_id = (select auth.uid()) and status in ('draft', 'pending_approval'))
  );
create policy "social_posts: delete" on public.social_posts for delete to authenticated
  using (
    (select public.has_role('manager'))
    or (author_id = (select auth.uid()) and status in ('draft', 'pending_approval'))
  );

create policy "social_post_targets: read" on public.social_post_targets for select to authenticated using ((select public.has_role('viewer')));
create policy "social_post_targets: write" on public.social_post_targets for all to authenticated
  using (
    exists (
      select 1 from public.social_posts p
      where p.id = post_id
        and ((select public.has_role('manager'))
             or (p.author_id = (select auth.uid()) and p.status in ('draft', 'pending_approval')))
    )
  )
  with check (
    exists (
      select 1 from public.social_posts p
      where p.id = post_id
        and ((select public.has_role('manager'))
             or (p.author_id = (select auth.uid()) and p.status in ('draft', 'pending_approval')))
    )
  );

-- ── Activity, notifications, push, email log, settings ─────────────────────
create policy "activity: read" on public.activity_log for select to authenticated using ((select public.has_role('viewer')));
-- Activity rows are written by the server (service role) so they cannot be forged or edited.

create policy "notifications: read own"   on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: update own" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: delete own" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy "push: manage own" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "email_log: admins read" on public.email_log for select to authenticated using ((select public.has_role('admin')));

create policy "settings: read"  on public.app_settings for select to authenticated using ((select public.has_role('viewer')));
create policy "settings: write" on public.app_settings for all    to authenticated using ((select public.has_role('admin'))) with check ((select public.has_role('admin')));

-- ════════════════════════════════════════════════════════════════════════════
--  Storage
-- ════════════════════════════════════════════════════════════════════════════
-- `social-media` must be publicly readable: Instagram, TikTok and Threads fetch
-- media by URL at publish time. Object names are random UUIDs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('social-media', 'social-media', true, 52428800,
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']),
  ('assets', 'assets', true, 10485760,
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf'])
on conflict (id) do nothing;

create policy "bgs storage: public read" on storage.objects for select
  using (bucket_id in ('social-media', 'assets'));
create policy "bgs storage: contributors upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('social-media', 'assets') and (select public.has_role('contributor')));
create policy "bgs storage: contributors update" on storage.objects for update to authenticated
  using (bucket_id in ('social-media', 'assets') and (select public.has_role('contributor')))
  with check (bucket_id in ('social-media', 'assets') and (select public.has_role('contributor')));
create policy "bgs storage: owner or manager delete" on storage.objects for delete to authenticated
  using (bucket_id in ('social-media', 'assets') and (owner = (select auth.uid()) or (select public.has_role('manager'))));

-- ════════════════════════════════════════════════════════════════════════════
--  Realtime
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
begin
  foreach t in array array[
    'notifications', 'activity_log', 'comments', 'deliverables', 'action_items', 'meetings',
    'panelists', 'panel_questions', 'outreach_contacts', 'sponsors', 'ticket_sales',
    'social_posts', 'social_post_targets', 'social_accounts', 'social_media'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
