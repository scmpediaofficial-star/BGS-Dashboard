-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 10 · Bulk SMS that survives a timeout
--
--  A blast is now sent in short rounds, each writing its results as it goes,
--  so a server that stops mid-way loses nothing and the blast can be resumed.
--  • sms_messages gains the 'sending' state: a number claimed by a round that
--    is in flight, so two rounds can never send to the same person.
--  • sms_campaigns remembers when it last made progress, so a blast nobody is
--    driving any more shows as stalled instead of "sending" for ever.
--
--  Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.sms_messages drop constraint if exists sms_messages_status_check;
alter table public.sms_messages add constraint sms_messages_status_check
  check (status in ('queued', 'sending', 'sent', 'failed', 'skipped'));

alter table public.sms_campaigns add column if not exists last_activity_at timestamptz;
update public.sms_campaigns set last_activity_at = coalesce(completed_at, created_at) where last_activity_at is null;

-- Numbers left mid-flight by the old sender are simply queued again.
update public.sms_messages set status = 'queued' where status = 'sending';
