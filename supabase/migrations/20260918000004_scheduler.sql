-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 04 · Scheduler
--
--  Vercel's free plan only runs cron jobs once a day, which is useless for
--  "publish this post at 12:30". Supabase can do it for free: pg_cron fires
--  every minute and pg_net calls the app's cron endpoints over HTTPS.
--
--  Nothing is scheduled by this migration. An administrator switches it on
--  from Settings → Scheduler, which calls configure_scheduler() with the
--  deployment's own URL and secret — no SQL to paste, nothing to configure.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
exception when others then
  raise notice 'pg_cron is not available here (%). The in-app scheduler will report itself as unavailable.', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net is not available here (%). The in-app scheduler will report itself as unavailable.', sqlerrm;
end $$;

-- ── Housekeeping: keeps a free-tier database small ──────────────────────────
create or replace function public.bgs_housekeeping()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.email_log set html = null where html is not null and created_at < now() - interval '14 days';
  delete from public.email_log     where created_at < now() - interval '90 days';
  delete from public.notifications where created_at < now() - interval '90 days';
  begin
    delete from cron.job_run_details where end_time < now() - interval '3 days';
  exception when others then null; -- pg_cron absent
  end;
end $$;

-- ── Switch on / re-point the jobs ───────────────────────────────────────────
create or replace function public.configure_scheduler(app_url text, secret text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  base text := regexp_replace(app_url, '/+$', '');
  headers text := json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret)::text;
begin
  if base !~ '^https?://' then
    raise exception 'app_url must start with http:// or https://';
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname in ('bgs-dispatch', 'bgs-daily', 'bgs-housekeeping');

  -- Every minute: publish due social posts, refresh expiring tokens.
  perform cron.schedule('bgs-dispatch', '* * * * *',
    format('select net.http_post(url := %L, headers := %L::jsonb, body := ''{}''::jsonb, timeout_milliseconds := 55000)', base || '/api/cron/dispatch', headers));

  -- 06:00 GMT (= Accra time): daily briefing email and deadline reminders.
  perform cron.schedule('bgs-daily', '0 6 * * *',
    format('select net.http_post(url := %L, headers := %L::jsonb, body := ''{}''::jsonb, timeout_milliseconds := 55000)', base || '/api/cron/daily', headers));

  perform cron.schedule('bgs-housekeeping', '30 3 * * *', 'select public.bgs_housekeeping()');
end $$;

create or replace function public.disable_scheduler()
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('bgs-dispatch', 'bgs-daily', 'bgs-housekeeping');
end $$;

-- ── Health, for the Settings page ───────────────────────────────────────────
create or replace function public.scheduler_status()
returns table (available boolean, jobname text, schedule text, active boolean, last_run timestamptz, last_status text, last_message text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return query select false, null::text, null::text, null::boolean, null::timestamptz, null::text, null::text;
    return;
  end if;

  return query
    select true, j.jobname::text, j.schedule::text, j.active, d.start_time, d.status::text, left(d.return_message, 300)::text
    from cron.job j
    left join lateral (
      select r.start_time, r.status, r.return_message
      from cron.job_run_details r
      where r.jobid = j.jobid
      order by r.start_time desc
      limit 1
    ) d on true
    where j.jobname like 'bgs-%'
    order by j.jobname;

  if not found then
    return query select true, null::text, null::text, null::boolean, null::timestamptz, null::text, null::text;
  end if;
end $$;

-- Server-side only: these run with the service-role key after an admin check.
revoke all on function public.configure_scheduler(text, text) from public, anon, authenticated;
revoke all on function public.disable_scheduler()             from public, anon, authenticated;
revoke all on function public.scheduler_status()              from public, anon, authenticated;
revoke all on function public.bgs_housekeeping()              from public, anon, authenticated;
grant execute on function public.configure_scheduler(text, text) to service_role;
grant execute on function public.disable_scheduler()             to service_role;
grant execute on function public.scheduler_status()              to service_role;
grant execute on function public.bgs_housekeeping()              to service_role;
