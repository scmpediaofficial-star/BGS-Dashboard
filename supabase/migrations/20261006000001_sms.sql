-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 09 · Bulk SMS
--
--  • sms_campaigns: one row per text message sent to a group of people — the
--    wording, who chose to send it, how many it reached and how many failed.
--  • sms_messages: one row per recipient with the gateway's answer, so a
--    number that failed can be found and sent to again.
--  Messages leave through BulkSMSGH (clientlogin.bulksmsgh.com) using the
--  BULKSMSGH_API_KEY environment variable; the sender ID and the other
--  choices live in app_settings under 'sms'.
--
--  Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.sms_campaigns (
  id            uuid primary key default gen_random_uuid(),
  message       text not null check (length(trim(message)) > 0),
  sender_id     text not null,
  audience      jsonb not null default '[]'::jsonb,   -- the groups chosen, kept for the history
  segments      int not null default 1,               -- SMS parts per person
  recipients    int not null default 0,
  sent          int not null default 0,
  failed        int not null default 0,
  status        text not null default 'sending' check (status in ('sending', 'sent', 'partial', 'failed', 'skipped')),
  error         text,
  sent_by       uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists sms_campaigns_created_idx on public.sms_campaigns (created_at desc);

create table if not exists public.sms_messages (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.sms_campaigns (id) on delete cascade,
  to_phone      text not null,
  name          text,
  source        text not null default 'manual',       -- which list the number came from
  status        text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  code          int,                                  -- the gateway's response code
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists sms_messages_campaign_idx on public.sms_messages (campaign_id);

-- ── Security: managers and above, like tickets and payments ────────────────
alter table public.sms_campaigns enable row level security;
alter table public.sms_messages  enable row level security;

drop policy if exists "sms_campaigns: read"  on public.sms_campaigns;
drop policy if exists "sms_campaigns: write" on public.sms_campaigns;
drop policy if exists "sms_messages: read"   on public.sms_messages;
drop policy if exists "sms_messages: write"  on public.sms_messages;
create policy "sms_campaigns: read"  on public.sms_campaigns for select to authenticated using ((select public.has_role('manager')));
create policy "sms_campaigns: write" on public.sms_campaigns for all    to authenticated using ((select public.has_role('manager'))) with check ((select public.has_role('manager')));
create policy "sms_messages: read"   on public.sms_messages  for select to authenticated using ((select public.has_role('manager')));
create policy "sms_messages: write"  on public.sms_messages  for all    to authenticated using ((select public.has_role('manager'))) with check ((select public.has_role('manager')));

do $$
begin
  alter publication supabase_realtime add table public.sms_campaigns;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.sms_messages;
exception when duplicate_object then null;
end $$;

-- ── Housekeeping: per-recipient rows are trimmed after a year ──────────────
create or replace function public.bgs_housekeeping()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.email_log set html = null where html is not null and created_at < now() - interval '14 days';
  delete from public.email_log     where created_at < now() - interval '90 days';
  delete from public.notifications where created_at < now() - interval '90 days';
  delete from public.sms_messages  where created_at < now() - interval '365 days';
  begin
    delete from cron.job_run_details where end_time < now() - interval '3 days';
  exception when others then null; -- pg_cron absent
  end;
end $$;
