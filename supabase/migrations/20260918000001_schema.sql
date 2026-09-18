-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 01 · Schema
--  Boardroom Governance Summit — planning, production & social command centre
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Enums ───────────────────────────────────────────────────────────────────
create type public.user_role           as enum ('super_admin', 'admin', 'manager', 'contributor', 'viewer');
create type public.deliverable_status  as enum ('pending', 'in_progress', 'in_review', 'blocked', 'completed');
create type public.priority_level      as enum ('low', 'medium', 'high', 'critical');
create type public.panelist_status     as enum ('proposed', 'submitted', 'confirmed', 'declined');
create type public.outreach_status     as enum ('pending', 'submitted', 'acknowledged', 'confirmed', 'declined');
create type public.sponsor_stage       as enum ('prospect', 'approached', 'proposal_sent', 'negotiating', 'confirmed', 'declined');
create type public.payment_status      as enum ('paid', 'pending', 'complimentary', 'refunded');
create type public.action_status       as enum ('open', 'in_progress', 'done');
create type public.social_post_status  as enum ('draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'partial', 'failed');

-- ── Shared trigger: updated_at ──────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
--  People
-- ════════════════════════════════════════════════════════════════════════════
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text not null,
  full_name           text not null default '',
  avatar_url          text,
  job_title           text,
  organization        text,
  phone               text,
  role                public.user_role not null default 'viewer',
  is_active           boolean not null default false,
  notification_prefs  jsonb not null default '{}'::jsonb,
  timezone            text not null default 'Africa/Accra',
  invited_by          uuid references public.profiles (id) on delete set null,
  invited_at          timestamptz,
  last_seen_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where is_active;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
--  Deliverables
-- ════════════════════════════════════════════════════════════════════════════
create table public.workstreams (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text,
  color_slot   int  not null default 1 check (color_slot between 1 and 6),
  icon         text,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

create table public.deliverables (
  id              uuid primary key default gen_random_uuid(),
  workstream_id   uuid not null references public.workstreams (id) on delete cascade,
  section         text not null default 'General',
  title           text not null check (length(trim(title)) > 0),
  description     text,
  quantity        int check (quantity is null or quantity >= 0),
  responsibility  text,
  assignee_id     uuid references public.profiles (id) on delete set null,
  status          public.deliverable_status not null default 'pending',
  priority        public.priority_level not null default 'medium',
  due_date        date,
  comment         text,
  checklist       jsonb not null default '[]'::jsonb,
  sort_order      int not null default 0,
  completed_at    timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  updated_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index deliverables_workstream_idx on public.deliverables (workstream_id, sort_order);
create index deliverables_status_idx     on public.deliverables (status);
create index deliverables_due_idx        on public.deliverables (due_date) where status <> 'completed';
create index deliverables_assignee_idx   on public.deliverables (assignee_id);
create trigger deliverables_touch before update on public.deliverables
  for each row execute function public.touch_updated_at();

-- Stamp / clear completed_at automatically so reports never drift from status.
create or replace function public.sync_deliverable_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger deliverables_completion before insert or update of status on public.deliverables
  for each row execute function public.sync_deliverable_completion();

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,
  entity_id    uuid not null,
  author_id    uuid references public.profiles (id) on delete set null,
  body         text not null check (length(trim(body)) > 0),
  created_at   timestamptz not null default now()
);
create index comments_entity_idx on public.comments (entity_type, entity_id, created_at);

-- ════════════════════════════════════════════════════════════════════════════
--  Programme: panels, panelists, questions
-- ════════════════════════════════════════════════════════════════════════════
create table public.panels (
  id                uuid primary key default gen_random_uuid(),
  number            int not null unique,
  title             text not null,
  perspective       text,
  moderator         text,
  starts_at         timestamptz,
  duration_minutes  int,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger panels_touch before update on public.panels
  for each row execute function public.touch_updated_at();

create table public.panelists (
  id                uuid primary key default gen_random_uuid(),
  panel_id          uuid not null references public.panels (id) on delete cascade,
  full_name         text not null check (length(trim(full_name)) > 0),
  job_title         text,
  organization      text,
  status            public.panelist_status not null default 'proposed',
  email             text,
  phone             text,
  photo_url         text,
  bio               text,
  citation          text,
  photo_received    boolean not null default false,
  bio_received      boolean not null default false,
  artwork_done      boolean not null default false,
  citation_done     boolean not null default false,
  notes             text,
  sort_order        int not null default 0,
  updated_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index panelists_panel_idx  on public.panelists (panel_id, sort_order);
create index panelists_status_idx on public.panelists (status);
create trigger panelists_touch before update on public.panelists
  for each row execute function public.touch_updated_at();

create table public.panel_questions (
  id          uuid primary key default gen_random_uuid(),
  panel_id    uuid not null references public.panels (id) on delete cascade,
  question    text not null check (length(trim(question)) > 0),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index panel_questions_panel_idx on public.panel_questions (panel_id, sort_order);

-- ════════════════════════════════════════════════════════════════════════════
--  Outreach: invitation letters, embassies & institutions
-- ════════════════════════════════════════════════════════════════════════════
create table public.outreach_contacts (
  id              uuid primary key default gen_random_uuid(),
  list            text not null check (list in ('letters', 'embassies')),
  category        text not null default 'General',
  name            text not null check (length(trim(name)) > 0),
  status          public.outreach_status not null default 'pending',
  contact_person  text,
  email           text,
  phone           text,
  notes           text,
  submitted_on    date,
  follow_up_on    date,
  sort_order      int not null default 0,
  updated_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index outreach_list_idx   on public.outreach_contacts (list, category, sort_order);
create index outreach_status_idx on public.outreach_contacts (status);
create trigger outreach_touch before update on public.outreach_contacts
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
--  Sponsorship pipeline
-- ════════════════════════════════════════════════════════════════════════════
create table public.sponsors (
  id                uuid primary key default gen_random_uuid(),
  organization      text not null check (length(trim(organization)) > 0),
  package           text,
  stage             public.sponsor_stage not null default 'prospect',
  amount            numeric(14, 2) check (amount is null or amount >= 0),
  currency          text not null default 'GHS',
  responsibility    text,
  owner_id          uuid references public.profiles (id) on delete set null,
  contact_person    text,
  email             text,
  phone             text,
  next_action       text,
  next_action_on    date,
  comment           text,
  logo_url          text,
  sort_order        int not null default 0,
  updated_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index sponsors_stage_idx on public.sponsors (stage, sort_order);
create trigger sponsors_touch before update on public.sponsors
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
--  Tickets & virtual access
-- ════════════════════════════════════════════════════════════════════════════
create table public.ticket_types (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  price        numeric(14, 2) check (price is null or price >= 0),
  currency     text not null default 'GHS',
  capacity     int check (capacity is null or capacity >= 0),
  is_virtual   boolean not null default false,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.ticket_sales (
  id              uuid primary key default gen_random_uuid(),
  ticket_type_id  uuid not null references public.ticket_types (id) on delete restrict,
  buyer_name      text not null check (length(trim(buyer_name)) > 0),
  buyer_email     text,
  buyer_phone     text,
  organization    text,
  country         text not null default 'Ghana',
  quantity        int not null default 1 check (quantity > 0),
  amount          numeric(14, 2) not null default 0 check (amount >= 0),
  currency        text not null default 'GHS',
  channel         text not null default 'website'
                    check (channel in ('website', 'direct', 'corporate', 'sponsor', 'complimentary', 'other')),
  payment_status  public.payment_status not null default 'paid',
  reference       text,
  sold_at         timestamptz not null default now(),
  access_code     text unique,
  access_sent_at  timestamptz,
  notes           text,
  recorded_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index ticket_sales_sold_idx on public.ticket_sales (sold_at desc);
create index ticket_sales_type_idx on public.ticket_sales (ticket_type_id);
create trigger ticket_sales_touch before update on public.ticket_sales
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
--  Meetings & action points
-- ════════════════════════════════════════════════════════════════════════════
create table public.meetings (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  meeting_at    timestamptz not null,
  venue         text,
  mode          text not null default 'in_person' check (mode in ('in_person', 'virtual', 'hybrid')),
  status        text not null default 'scheduled' check (status in ('scheduled', 'held', 'cancelled')),
  join_url      text,
  attendees     jsonb not null default '[]'::jsonb,
  sections      jsonb not null default '[]'::jsonb,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index meetings_at_idx on public.meetings (meeting_at desc);
create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_updated_at();

create table public.action_items (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid references public.meetings (id) on delete cascade,
  number        int,
  title         text not null check (length(trim(title)) > 0),
  owner_label   text,
  assignee_id   uuid references public.profiles (id) on delete set null,
  due_date      date,
  due_label     text,
  status        public.action_status not null default 'open',
  notes         text,
  completed_at  timestamptz,
  sort_order    int not null default 0,
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index action_items_meeting_idx  on public.action_items (meeting_id, sort_order);
create index action_items_status_idx   on public.action_items (status);
create index action_items_assignee_idx on public.action_items (assignee_id);
create trigger action_items_touch before update on public.action_items
  for each row execute function public.touch_updated_at();

create or replace function public.sync_action_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger action_items_completion before insert or update of status on public.action_items
  for each row execute function public.sync_action_completion();

-- ════════════════════════════════════════════════════════════════════════════
--  Social Studio
-- ════════════════════════════════════════════════════════════════════════════
-- Developer-app credentials per network. Secrets are AES-256-GCM encrypted by the
-- server before they are stored. No RLS policies: service-role access only.
create table public.social_apps (
  provider           text primary key,
  client_id          text,
  client_secret_enc  text,
  extra              jsonb not null default '{}'::jsonb,
  updated_by         uuid references public.profiles (id) on delete set null,
  updated_at         timestamptz not null default now()
);

create table public.social_accounts (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  external_id       text not null,
  display_name      text not null,
  username          text,
  avatar_url        text,
  account_type      text not null default 'profile',
  profile_url       text,
  status            text not null default 'active' check (status in ('active', 'expired', 'error')),
  status_detail     text,
  scopes            text[] not null default '{}',
  token_expires_at  timestamptz,
  meta              jsonb not null default '{}'::jsonb,
  connected_by      uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, external_id)
);
create trigger social_accounts_touch before update on public.social_accounts
  for each row execute function public.touch_updated_at();

-- Tokens live apart from the account row so no client-side query can ever select them.
create table public.social_account_secrets (
  account_id         uuid primary key references public.social_accounts (id) on delete cascade,
  access_token_enc   text,
  refresh_token_enc  text,
  extra_enc          text,
  updated_at         timestamptz not null default now()
);

create table public.social_media (
  id                uuid primary key default gen_random_uuid(),
  bucket            text not null default 'social-media',
  path              text not null,
  url               text not null,
  file_name         text not null,
  mime_type         text not null,
  size_bytes        bigint not null default 0,
  width             int,
  height            int,
  duration_seconds  numeric(8, 2),
  alt_text          text,
  uploaded_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (bucket, path)
);
create index social_media_created_idx on public.social_media (created_at desc);

create table public.social_posts (
  id              uuid primary key default gen_random_uuid(),
  content         text not null default '',
  media_ids       uuid[] not null default '{}',
  link_url        text,
  tags            text[] not null default '{}',
  campaign        text,
  status          public.social_post_status not null default 'draft',
  scheduled_at    timestamptz,
  published_at    timestamptz,
  author_id       uuid references public.profiles (id) on delete set null,
  approver_id     uuid references public.profiles (id) on delete set null,
  approved_at     timestamptz,
  rejection_note  text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index social_posts_status_idx    on public.social_posts (status, scheduled_at);
create index social_posts_scheduled_idx on public.social_posts (scheduled_at);
create trigger social_posts_touch before update on public.social_posts
  for each row execute function public.touch_updated_at();

create table public.social_post_targets (
  id                  uuid primary key default gen_random_uuid(),
  post_id             uuid not null references public.social_posts (id) on delete cascade,
  account_id          uuid not null references public.social_accounts (id) on delete cascade,
  content_override    text,
  options             jsonb not null default '{}'::jsonb,
  status              text not null default 'pending'
                        check (status in ('pending', 'publishing', 'published', 'failed', 'skipped')),
  external_id         text,
  external_url        text,
  error               text,
  attempts            int not null default 0,
  published_at        timestamptz,
  metrics             jsonb not null default '{}'::jsonb,
  metrics_updated_at  timestamptz,
  unique (post_id, account_id)
);
create index social_post_targets_post_idx    on public.social_post_targets (post_id);
create index social_post_targets_account_idx on public.social_post_targets (account_id);

create table public.social_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  content     text not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.social_hashtag_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  hashtags    text not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════════
--  Activity, notifications, push, email log, settings
-- ════════════════════════════════════════════════════════════════════════════
create table public.activity_log (
  id            bigint generated always as identity primary key,
  actor_id      uuid references public.profiles (id) on delete set null,
  actor_name    text,
  action        text not null,
  category      text not null default 'general',
  entity_type   text,
  entity_id     uuid,
  entity_label  text,
  summary       text not null,
  link          text,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index activity_created_idx on public.activity_log (created_at desc);
create index activity_entity_idx  on public.activity_log (entity_type, entity_id);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  category     text not null default 'general',
  importance   text not null default 'normal' check (importance in ('low', 'normal', 'high')),
  title        text not null,
  body         text,
  link         text,
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_name   text,
  entity_type  text,
  entity_id    uuid,
  digest_sent  boolean not null default false,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_user_idx   on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.email_log (
  id           uuid primary key default gen_random_uuid(),
  to_email     text not null,
  subject      text not null,
  template     text not null,
  status       text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id  text,
  error        text,
  html         text,
  created_at   timestamptz not null default now()
);
create index email_log_created_idx on public.email_log (created_at desc);

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
